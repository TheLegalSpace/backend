import { env } from "../config/env";
import { badRequest } from "../helpers/utility";

/**
 * reCAPTCHA verification for the professional signup form.
 *
 * Off by default (`CAPTCHA_ENABLED=false`) so local and preview environments
 * don't need a key pair. While off, a token is neither required nor checked.
 *
 * When on, a missing or failing token is a 400 rather than a silent pass — a
 * captcha that fails open is decoration.
 */
export const verifyCaptcha = async (token?: string | null): Promise<void> => {
  if (!env.captchaEnabled) return;

  if (!env.captchaSecret) {
    // Misconfiguration, not user error: enabled with no secret would reject
    // every real signup. Log loudly and let them through rather than taking
    // the signup form down.
    console.error("[captcha] CAPTCHA_ENABLED=true but RECAPTCHA_SECRET is unset — skipping");
    return;
  }

  if (!token) throw badRequest("Please complete the captcha");

  try {
    const body = new URLSearchParams({ secret: env.captchaSecret, response: token });
    const res = await fetch(env.captchaVerifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!data.success) {
      console.warn("[captcha] verification rejected", data["error-codes"]);
      throw badRequest("Captcha verification failed. Please try again.");
    }
  } catch (err: any) {
    if (err?.statusCode === 400) throw err;
    // Provider unreachable. Blocking every signup because Google is having a
    // bad minute is worse than the abuse the captcha prevents.
    console.error("[captcha] verification call failed — allowing through:", err?.message);
  }
};
