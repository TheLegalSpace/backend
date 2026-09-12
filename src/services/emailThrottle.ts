import { redis } from "../config/redis";
import { tooManyRequests } from "../helpers/utility";

/**
 * Per-address throttle on outbound auth codes.
 *
 * This exists because of what we gave up by taking delivery off Supabase. Their
 * mailer enforced a 60-second-per-user window on signup/resend/recover, and that
 * — not our own limiter — was the only thing stopping someone pointing
 * `/register/resend` at a stranger's inbox and holding the button down.
 * `admin.generateLink` is an admin-key call, so none of those limits apply to it
 * any more.
 *
 * The global limiter in `middleware/rateLimiter.ts` does not cover this: it keys
 * on `account?.id || req.ip`, and these routes are unauthenticated, so it degrades
 * to per-IP — which throttles one attacker, not one victim. The address being
 * mailed is the thing that needs protecting, so the address is the key.
 *
 * Two layers:
 *  - a short cooldown, so a code can't be re-sent every second; and
 *  - a daily ceiling, so a patient attacker can't bomb an inbox (or burn the
 *    sending quota) one request per minute all day.
 *
 * Fails **open** if Redis is unreachable, matching `captcha.ts`: taking signup
 * down because the cache is having a bad minute is worse than the abuse this
 * prevents.
 */

const COOLDOWN_SECONDS = 60;
const DAILY_LIMIT = 10;
const DAILY_WINDOW_SECONDS = 24 * 60 * 60;

export type EmailThrottleStage = "register" | "reset";

const cooldownKey = (stage: EmailThrottleStage, email: string) =>
  `authmail:cooldown:${stage}:${email.toLowerCase()}`;

const dailyKey = (stage: EmailThrottleStage, email: string) =>
  `authmail:daily:${stage}:${email.toLowerCase()}`;

/**
 * Claim the right to send a code to this address, or throw 429.
 *
 * Call this *before* generating and sending — claiming after the send makes the
 * send the thing that's rate limited, which is the wrong order.
 */
export const assertCanSendAuthEmail = async (
  stage: EmailThrottleStage,
  email: string
): Promise<void> => {
  try {
    const claimed = await redis.set(
      cooldownKey(stage, email),
      "1",
      "EX",
      COOLDOWN_SECONDS,
      "NX"
    );
    if (claimed !== "OK") {
      const ttl = await redis.ttl(cooldownKey(stage, email)).catch(() => COOLDOWN_SECONDS);
      const wait = ttl > 0 ? ttl : COOLDOWN_SECONDS;
      throw tooManyRequests(
        `Please wait ${wait} second${wait === 1 ? "" : "s"} before requesting another code.`
      );
    }

    const used = await redis.incr(dailyKey(stage, email));
    if (used === 1) {
      await redis.expire(dailyKey(stage, email), DAILY_WINDOW_SECONDS).catch(() => null);
    }
    if (used > DAILY_LIMIT) {
      // Deliberately not "you have sent 11 of 10" — the ceiling is an
      // anti-abuse detail and telling an attacker where it sits helps them
      // pace around it.
      console.warn(`[authmail] daily ceiling hit stage=${stage} email=${email} used=${used}`);
      throw tooManyRequests(
        "Too many codes requested for this email today. Please try again tomorrow or contact support."
      );
    }
  } catch (err: any) {
    if (err?.statusCode === 429) throw err;
    console.error("[authmail] throttle check failed — allowing through:", err?.message);
  }
};

/**
 * Drop the cooldown for an address.
 *
 * Used when the send itself failed: the user got no code, so making them wait a
 * minute to retry would punish them for our outage.
 */
export const releaseAuthEmailCooldown = async (
  stage: EmailThrottleStage,
  email: string
): Promise<void> => {
  await redis.del(cooldownKey(stage, email)).catch(() => null);
};
