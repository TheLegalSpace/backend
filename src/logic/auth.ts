import { prisma } from "../config/database";
import { supabase, supabaseAdmin } from "../config/supabase";
import { redis } from "../config/redis";
import { badRequest, conflict, notFound, response, unauthorized } from "../helpers/utility";
import { Response, Role } from "../interface";
import {
  findAccountByAuthUserId,
  findAccountByEmail,
  softDeleteAccount,
} from "../dao/account";
import { invalidateAccountCache } from "../middleware/auth";
import { onboardingState } from "../services/onboarding";
import { verifyCaptcha } from "../services/captcha";
import { sendEmail } from "../services/email";
import { verificationCodeEmail, passwordResetCodeEmail } from "../services/emailTemplates";
import {
  assertCanSendAuthEmail,
  releaseAuthEmailCooldown,
  EmailThrottleStage,
} from "../services/emailThrottle";
import { releaseBatchIfSettled } from "../dao/matchOffer";
import { dispatchNotification } from "../services/notification";
import { matterNameOf } from "./request";

const ROLE_KEY = (email: string) => `register:role:${email.toLowerCase()}`;
const ROLE_TTL_SECONDS = 24 * 60 * 60;

const placeholderName = (email: string) => {
  const local = email.split("@")[0] || "user";
  return local.slice(0, 80);
};

const sessionFrom = (s: any) => ({
  accessToken: s.access_token,
  refreshToken: s.refresh_token,
  expiresAt: s.expires_at,
});

/**
 * Mint a one-time code and deliver it ourselves.
 *
 * `admin.generateLink` generates the code and *sends nothing* — which is the
 * whole point. Supabase's built-in mailer is capped at 2 emails per hour
 * project-wide (two signups an hour across the platform, with password resets
 * drawing from the same bucket), so delivery moved to SMTP while Supabase keeps
 * owning code generation, expiry and verification. `verifyOtp` on the other side
 * is unchanged.
 *
 * Note the code's *length* is a Supabase project setting
 * (Authentication → Email → Email OTP Length, range 6–10), not something we pass
 * here. `registerVerifySchema` stays permissive so a change to it can't break
 * verification.
 *
 * Order matters: throttle, then generate, then send. The cooldown is released if
 * the send fails, so an SMTP outage doesn't also lock the user out for a minute.
 */
const issueAuthCode = async (opts: {
  stage: EmailThrottleStage;
  email: string;
  linkType: "magiclink" | "recovery";
  build: (code: string) => { subject: string; html: string; text: string };
}): Promise<void> => {
  const { stage, email, linkType, build } = opts;

  await assertCanSendAuthEmail(stage, email);

  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: linkType,
      email,
    });
    if (error || !data?.properties?.email_otp) {
      console.error(`[auth] ${stage} generateLink failed email=${email}`, {
        status: (error as any)?.status,
        code: (error as any)?.code,
        message: error?.message,
      });
      // Carry the upstream status/code through: callers branch on it (see
      // _forgotPassword's user_not_found handling), and a bare Error would make
      // them sniff the message string instead.
      const wrapped: any = new Error(
        error?.message || "Could not generate a verification code"
      );
      wrapped.status = (error as any)?.status;
      wrapped.code = (error as any)?.code;
      throw wrapped;
    }

    const { subject, html, text } = build(data.properties.email_otp);
    await sendEmail({ to: email, subject, html, text });
    console.log(`[auth] ${stage} code delivered email=${email}`);
  } catch (err) {
    await releaseAuthEmailCooldown(stage, email);
    throw err;
  }
};

interface RegisterStartBody {
  email: string;
  password: string;
  role: Role;
  captchaToken?: string;
}

export const _registerStart = async (body: RegisterStartBody): Promise<Response> => {
  if (body.role === "ADMIN") throw badRequest("Cannot self-register as ADMIN");

  // Before anything is created in Supabase — a captcha that runs after the
  // account exists has already let the bot win.
  await verifyCaptcha(body.captchaToken);

  const existing = await findAccountByEmail(body.email);
  if (existing && existing.status !== "deleted") {
    throw conflict("An account with this email already exists");
  }

  console.log(`[auth] register.start email=${body.email} role=${body.role}`);

  const created = await supabaseAdmin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: false,
  });
  if (created.error) {
    // If the user already exists in Supabase (orphaned from a previous attempt), just resend the OTP.
    if (
      created.error.message?.toLowerCase().includes("already") ||
      (created.error as any).status === 422
    ) {
      // fall through to resend
      console.log(
        `[auth] register.start auth user already exists, resending email=${body.email}`
      );
    } else {
      console.error(`[auth] register.start createUser failed email=${body.email}`, {
        status: (created.error as any)?.status,
        code: (created.error as any)?.code,
        message: created.error.message,
      });
      throw new Error(created.error.message || "Failed to create auth user");
    }
  }

  await issueAuthCode({
    stage: "register",
    email: body.email,
    // `magiclink`, not `signup`, and deliberately so: `generateLink({type:"signup"})`
    // demands the password, which `_registerResend` does not have and must not
    // stash anywhere to get. `magiclink` needs only the address, so both paths
    // mint codes the same way — and verifying one confirms the email just as the
    // signup code did.
    linkType: "magiclink",
    build: verificationCodeEmail,
  });

  await redis.set(ROLE_KEY(body.email), body.role, "EX", ROLE_TTL_SECONDS).catch(() => null);

  return response({
    error: false,
    message: "Verification code sent to email",
    data: { email: body.email },
  });
};

export const _registerResend = async (email: string): Promise<Response> => {
  console.log(`[auth] register.resend requested email=${email}`);

  // `generateLink({type:"magiclink"})` **creates the auth user when none exists**
  // rather than failing. Left unguarded, this endpoint would mint an orphaned
  // Supabase identity — no Account row, no password, no way to ever sign in —
  // for any address anyone cared to POST at it.
  //
  // The role key is the marker that a registration is genuinely in flight:
  // _registerStart writes it, _registerVerify deletes it on success. Requiring
  // it means resend can only ever re-send, never create.
  const pending = await redis.get(ROLE_KEY(email)).catch(() => null);
  if (!pending) {
    throw badRequest("No pending registration for this email. Please sign up again.");
  }

  await issueAuthCode({
    stage: "register",
    email,
    linkType: "magiclink",
    build: verificationCodeEmail,
  });
  return response({
    error: false,
    message: "Verification code resent",
    data: { email },
  });
};

interface RegisterVerifyBody {
  email: string;
  otp: string;
}

export const _registerVerify = async (body: RegisterVerifyBody): Promise<Response> => {
  const { data, error } = await supabase.auth.verifyOtp({
    email: body.email,
    token: body.otp,
    // Matches the `magiclink` code minted in _registerStart/_registerResend.
    // Verifying it stamps `email_confirmed_at` exactly as the signup code did,
    // so the account still lands here confirmed.
    type: "magiclink",
  });
  if (error || !data?.session || !data?.user) {
    // Pairs with the register.start/resend lines above — lets you tell a code
    // that never arrived from one that arrived and was entered wrong or late.
    console.error(`[auth] register.verify rejected email=${body.email}`, {
      status: (error as any)?.status,
      code: (error as any)?.code,
      message: error?.message,
    });
    throw unauthorized(error?.message || "Invalid or expired verification code");
  }
  console.log(`[auth] register.verify ok email=${body.email}`);

  const authUserId = data.user.id;
  const session = sessionFrom(data.session);

  const existing = await findAccountByAuthUserId(authUserId);
  if (existing) {
    await invalidateAccountCache(authUserId);
    return response({
      error: false,
      message: "Account already exists",
      data: { account: existing, session },
    });
  }

  const roleRaw = await redis.get(ROLE_KEY(body.email)).catch(() => null);
  const role = (roleRaw as Role) || "USER";

  const account = await prisma.account.create({
    data: {
      authUserId,
      email: body.email,
      fullName: placeholderName(body.email),
      role,
      status: "active",
    },
    include: {
      lawyerProfile: true,
      firmProfile: true,
      practiceAreaLinks: { include: { practiceArea: true } },
    },
  });

  await redis.del(ROLE_KEY(body.email)).catch(() => null);
  await invalidateAccountCache(authUserId);

  return response({
    error: false,
    message: "Registration successful",
    data: { account, session },
  });
};

interface RegisterGoogleBody {
  idToken: string;
  role: Role;
  fullName?: string;
}

export const _registerGoogle = async (body: RegisterGoogleBody): Promise<Response> => {
  if (body.role === "ADMIN") throw badRequest("Cannot self-register as ADMIN");

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: body.idToken,
  });
  if (error || !data?.session || !data?.user) {
    throw unauthorized(error?.message || "Google sign-in failed");
  }

  const authUserId = data.user.id;
  const email = data.user.email!;
  const session = sessionFrom(data.session);

  const existing = await findAccountByAuthUserId(authUserId);
  if (existing) {
    await invalidateAccountCache(authUserId);
    return response({
      error: false,
      message: "Logged in",
      data: { account: existing, session, isNew: false },
    });
  }

  const meta = (data.user.user_metadata || {}) as any;
  const fullName =
    body.fullName?.trim() ||
    meta.full_name ||
    meta.name ||
    placeholderName(email);

  const firstName: string | null = meta.given_name || null;
  const lastName: string | null = meta.family_name || null;

  const account = await prisma.account.create({
    data: {
      authUserId,
      email,
      fullName,
      firstName,
      lastName,
      role: body.role,
      status: "active",
    },
    include: {
      lawyerProfile: true,
      firmProfile: true,
      practiceAreaLinks: { include: { practiceArea: true } },
    },
  });

  await invalidateAccountCache(authUserId);

  return response({
    error: false,
    message: "Registration successful",
    data: { account, session, isNew: true },
  });
};

interface LoginBody {
  authProvider: "email" | "google";
  email?: string;
  password?: string;
  idToken?: string;
}

export const _login = async (body: LoginBody): Promise<Response> => {
  let authUserId: string;
  let session: any;

  if (body.authProvider === "email") {
    if (!body.email || !body.password) throw badRequest("Email and password are required");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });
    if (error || !data?.session) throw unauthorized(error?.message || "Login failed");
    authUserId = data.user.id;
    session = sessionFrom(data.session);
  } else if (body.authProvider === "google") {
    if (!body.idToken) throw badRequest("idToken is required");
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: body.idToken,
    });
    if (error || !data?.session) throw unauthorized(error?.message || "Google sign-in failed");
    authUserId = data.user.id;
    session = sessionFrom(data.session);
  } else {
    throw badRequest("Invalid authProvider");
  }

  const account = await findAccountByAuthUserId(authUserId);
  if (!account) {
    throw notFound("Account not found — please register first");
  }
  await invalidateAccountCache(authUserId);
  // The same onboarding block `GET /profile/me` returns. A lawyer who is not yet
  // verified logs in successfully and then finds the platform closed, so the
  // login response has to say where to send them — otherwise the client's first
  // move after a valid login is a request that 403s.
  const isProfessional = account.role === "LAWYER" || account.role === "FIRM";
  return response({
    error: false,
    message: "Login successful",
    data: {
      account,
      session,
      onboarding: isProfessional ? onboardingState(account) : null,
    },
  });
};

export const _refresh = async (refreshToken: string): Promise<Response> => {
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data?.session) throw unauthorized(error?.message || "Refresh failed");
  return response({
    error: false,
    message: "Token refreshed",
    data: { session: sessionFrom(data.session) },
  });
};

export const _logout = async (authUserId: string, accessToken: string): Promise<Response> => {
  await supabaseAdmin.auth.admin.signOut(accessToken).catch(() => null);
  await invalidateAccountCache(authUserId);
  return response({ error: false, message: "Logged out" });
};

export const _forgotPassword = async (email: string): Promise<Response> => {
  // Used to share the signup codes' project-wide email quota, so a burst of
  // resets could starve registration (and vice versa). Both now go out over our
  // own SMTP, so neither can crowd the other out.
  try {
    await issueAuthCode({
      stage: "reset",
      email,
      linkType: "recovery",
      build: passwordResetCodeEmail,
    });
  } catch (err: any) {
    // `resetPasswordForEmail` reported success for an unknown address on
    // purpose; `generateLink({type:"recovery"})` 404s instead. Surfacing that
    // would turn this endpoint into an account-enumeration oracle — ask it about
    // an address and it tells you whether that person has an account here. Log
    // it, answer identically either way.
    const status = err?.status ?? err?.statusCode;
    const code = err?.code ?? err?.error_code;
    if (status === 404 || code === "user_not_found" || /not found/i.test(err?.message || "")) {
      console.log(`[auth] forgot-password for unknown email=${email} — responding generically`);
    } else {
      throw err;
    }
  }
  // Deliberately identical whether or not the account exists.
  return response({ error: false, message: "Password reset email sent" });
};

export const _verifyResetCode = async (
  email: string,
  code: string
): Promise<Response> => {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "recovery",
  });
  if (error || !data?.session) {
    throw unauthorized(error?.message || "Invalid or expired code");
  }
  return response({
    error: false,
    message: "Code verified",
    data: { session: sessionFrom(data.session) },
  });
};

export const _resetPassword = async (
  accessToken: string,
  newPassword: string
): Promise<Response> => {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw unauthorized(error?.message || "Invalid or expired session");
  }
  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
    data.user.id,
    { password: newPassword }
  );
  if (updateErr) throw new Error(updateErr.message);
  return response({ error: false, message: "Password reset successful" });
};

export const _deleteAccount = async (
  accountId: string,
  authUserId: string
): Promise<Response> => {
  const { expiredRequests } = await softDeleteAccount(accountId);
  await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => null);
  await invalidateAccountCache(authUserId);

  // Post-commit, and best-effort: the account is already gone, and a failed
  // notification must not surface as a failed deletion. Same shape as the
  // stale-request cron, which settles requests the same way.
  for (const r of expiredRequests) {
    const clientLeft = r.userAccountId === accountId;
    const recipientAccountId = clientLeft ? r.lawyerAccountId : r.userAccountId;
    try {
      // The client got nothing out of the match, so give their cooldown and
      // allowance slot back rather than making them sit out 48h for someone
      // else's departure. Moot when it was the client who left.
      await releaseBatchIfSettled(r.id);
      await dispatchNotification({
        recipientAccountId,
        type: "request_closed_account",
        payload: {
          requestId: r.id,
          actorAccountId: accountId,
          matterName: await matterNameOf(r.intakePayload),
          deletedParty: clientLeft ? "client" : "lawyer",
        },
      });
    } catch (err) {
      console.error(
        "[auth] failed to settle request on account deletion:",
        (err as Error).message
      );
    }
  }

  return response({ error: false, message: "Account deleted" });
};
