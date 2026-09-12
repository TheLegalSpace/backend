import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Auth-code delivery: Supabase mints the code (`admin.generateLink`, which sends
 * nothing), we deliver it over our own SMTP.
 *
 * Most of what is pinned here are *silent* failures — the kind that leave the
 * happy path working perfectly while something quietly goes wrong in the
 * background. Nothing in a manual test would reveal them:
 *
 *  - resend minting orphaned Supabase users for arbitrary addresses,
 *  - forgot-password leaking whether an account exists,
 *  - the throttle failing to hold, which is the only thing standing between
 *    /register/resend and an email-bombing vector now that Supabase's per-user
 *    60s window no longer applies to admin-key calls.
 */

const generateLink = vi.fn();
const sendEmail = vi.fn();
const redisGet = vi.fn();
const redisSet = vi.fn();
const redisDel = vi.fn();
const redisTtl = vi.fn();
const redisIncr = vi.fn();
const redisExpire = vi.fn();
const findAccountByEmail = vi.fn();
const createUser = vi.fn();

vi.mock("../src/config/database", () => ({ prisma: { account: { create: vi.fn() } } }));
vi.mock("../src/config/redis", () => ({
  redis: {
    get: (...a: any[]) => redisGet(...a),
    set: (...a: any[]) => redisSet(...a),
    del: (...a: any[]) => redisDel(...a),
    ttl: (...a: any[]) => redisTtl(...a),
    incr: (...a: any[]) => redisIncr(...a),
    expire: (...a: any[]) => redisExpire(...a),
  },
}));
vi.mock("../src/config/supabase", () => ({
  supabase: { auth: {} },
  supabaseAdmin: {
    auth: {
      admin: {
        generateLink: (...a: any[]) => generateLink(...a),
        createUser: (...a: any[]) => createUser(...a),
      },
    },
  },
}));
vi.mock("../src/dao/account", () => ({
  findAccountByEmail: (...a: any[]) => findAccountByEmail(...a),
  findAccountByAuthUserId: vi.fn(),
  softDeleteAccount: vi.fn(),
}));
vi.mock("../src/middleware/auth", () => ({ invalidateAccountCache: vi.fn() }));
vi.mock("../src/services/captcha", () => ({ verifyCaptcha: vi.fn() }));
vi.mock("../src/services/email", () => ({ sendEmail: (...a: any[]) => sendEmail(...a) }));
vi.mock("../src/dao/matchOffer", () => ({ releaseBatchIfSettled: vi.fn() }));
vi.mock("../src/services/notification", () => ({ dispatchNotification: vi.fn() }));
vi.mock("../src/logic/request", () => ({ matterNameOf: vi.fn() }));

import { _registerStart, _registerResend, _forgotPassword } from "../src/logic/auth";

const OTP = "482915";
const EMAIL = "someone@example.com";

/** Default happy state: throttle free, generateLink succeeds, send succeeds. */
const allowSend = () => {
  redisSet.mockResolvedValue("OK"); // cooldown claimed
  redisIncr.mockResolvedValue(1); // first of the day
  redisExpire.mockResolvedValue(1);
  generateLink.mockResolvedValue({ data: { properties: { email_otp: OTP } }, error: null });
  sendEmail.mockResolvedValue(undefined);
};

beforeEach(() => {
  vi.clearAllMocks();
  redisGet.mockResolvedValue(null);
  redisDel.mockResolvedValue(1);
  redisTtl.mockResolvedValue(42);
});

describe("register start", () => {
  it("mints a magiclink code and mails it, rather than letting Supabase send", async () => {
    allowSend();
    findAccountByEmail.mockResolvedValue(null);
    createUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    await _registerStart({ email: EMAIL, password: "hunter2hunter2", role: "USER" as any });

    // `magiclink`, not `signup`: the signup variant demands the password, which
    // resend does not have and must not stash to get.
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: EMAIL });
    const sent = sendEmail.mock.calls[0][0];
    expect(sent.to).toBe(EMAIL);
    // The code must reach both bodies — a text part missing the code is a
    // plain-text client showing an empty email.
    expect(sent.html).toContain(OTP);
    expect(sent.text).toContain(OTP);
    expect(sent.subject).toContain(OTP);
  });
});

describe("register resend", () => {
  it("refuses when no registration is in flight", async () => {
    allowSend();
    redisGet.mockResolvedValue(null); // no role key => nothing pending

    await expect(_registerResend(EMAIL)).rejects.toMatchObject({ statusCode: 400 });

    // The guard's whole point: generateLink({type:"magiclink"}) CREATES the auth
    // user when none exists, so an unguarded resend mints orphaned Supabase
    // identities for any address posted at it.
    expect(generateLink).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("resends when a registration is in flight", async () => {
    allowSend();
    redisGet.mockResolvedValue("USER");

    await _registerResend(EMAIL);

    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: EMAIL });
    expect(sendEmail.mock.calls[0][0].text).toContain(OTP);
  });
});

describe("forgot password", () => {
  it("answers identically for an unknown address (no account enumeration)", async () => {
    allowSend();
    generateLink.mockResolvedValue({
      data: null,
      error: { status: 404, code: "user_not_found", message: "User with this email not found" },
    });

    const res = await _forgotPassword("nobody@example.com");

    // resetPasswordForEmail reported success for unknown addresses on purpose.
    // generateLink 404s instead, and surfacing that would turn this endpoint
    // into an oracle for "does this person have an account here".
    expect(res.error).toBe(false);
    expect(res.message).toBe("Password reset email sent");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns the same message for a known address", async () => {
    allowSend();
    const known = await _forgotPassword(EMAIL);
    const unknownRes = { error: false, message: "Password reset email sent" };
    expect({ error: known.error, message: known.message }).toEqual(unknownRes);
    expect(sendEmail.mock.calls[0][0].subject).toContain(OTP);
  });

  it("still surfaces genuine failures", async () => {
    allowSend();
    generateLink.mockResolvedValue({
      data: null,
      error: { status: 500, code: "internal", message: "upstream exploded" },
    });
    await expect(_forgotPassword(EMAIL)).rejects.toThrow(/upstream exploded/);
  });
});

describe("per-address throttle", () => {
  it("429s when the cooldown is already held", async () => {
    allowSend();
    redisGet.mockResolvedValue("USER");
    redisSet.mockResolvedValue(null); // SET NX lost => cooldown live
    redisTtl.mockResolvedValue(37);

    await expect(_registerResend(EMAIL)).rejects.toMatchObject({ statusCode: 429 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("429s once the daily ceiling is passed", async () => {
    allowSend();
    redisGet.mockResolvedValue("USER");
    redisIncr.mockResolvedValue(11); // limit is 10

    await expect(_registerResend(EMAIL)).rejects.toMatchObject({ statusCode: 429 });
  });

  it("releases the cooldown when the send fails, so a retry isn't punished", async () => {
    allowSend();
    redisGet.mockResolvedValue("USER");
    sendEmail.mockRejectedValue(new Error("smtp down"));

    await expect(_registerResend(EMAIL)).rejects.toThrow(/smtp down/);

    // An SMTP outage means the user got no code; making them wait 60s to try
    // again would punish them for our failure.
    expect(redisDel).toHaveBeenCalledWith(expect.stringContaining("authmail:cooldown:register:"));
  });

  it("does not let Redis being down take signup down with it", async () => {
    allowSend();
    redisGet.mockResolvedValue("USER");
    redisSet.mockRejectedValue(new Error("redis unreachable"));

    await expect(_registerResend(EMAIL)).resolves.toMatchObject({ error: false });
    expect(sendEmail).toHaveBeenCalled();
  });
});
