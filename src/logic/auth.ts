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

// Supabase owns delivery of the signup/reset codes, so a missing code is only
// ever visible in its send response. Log every outcome with the upstream
// status/code so Render logs answer "did it go out?" without needing a repro.
// The project-wide email cap is the common failure and gets its own line.
const logMailSend = (stage: string, email: string, err?: any) => {
  if (!err) {
    console.log(`[auth] ${stage} email accepted by supabase email=${email}`);
    return;
  }
  const fields = {
    status: err?.status,
    code: err?.code ?? err?.error_code,
    message: err?.message,
  };
  if (fields.status === 429 || fields.code === "over_email_send_rate_limit") {
    console.error(
      `[auth] ${stage} email BLOCKED — supabase email rate limit hit (project-wide cap, no code was sent) email=${email}`,
      fields
    );
    return;
  }
  console.error(`[auth] ${stage} email send failed email=${email}`, fields);
};

interface RegisterStartBody {
  email: string;
  password: string;
  role: Role;
}

export const _registerStart = async (body: RegisterStartBody): Promise<Response> => {
  if (body.role === "ADMIN") throw badRequest("Cannot self-register as ADMIN");

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

  const resent = await supabase.auth.resend({ type: "signup", email: body.email });
  logMailSend("register.start", body.email, resent.error);
  if (resent.error) {
    throw new Error(resent.error.message || "Failed to send verification code");
  }

  await redis.set(ROLE_KEY(body.email), body.role, "EX", ROLE_TTL_SECONDS).catch(() => null);

  return response({
    error: false,
    message: "Verification code sent to email",
    data: { email: body.email },
  });
};

export const _registerResend = async (email: string): Promise<Response> => {
  console.log(`[auth] register.resend requested email=${email}`);
  const resent = await supabase.auth.resend({ type: "signup", email });
  logMailSend("register.resend", email, resent.error);
  if (resent.error) {
    throw new Error(resent.error.message || "Failed to resend verification code");
  }
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
    type: "signup",
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
  return response({
    error: false,
    message: "Login successful",
    data: { account, session },
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
  // Shares the same project-wide email quota as the signup codes, so a burst of
  // resets is enough to starve registration (and vice versa).
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  logMailSend("forgot-password", email, error);
  if (error) throw new Error(error.message);
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
  await softDeleteAccount(accountId);
  await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => null);
  await invalidateAccountCache(authUserId);
  return response({ error: false, message: "Account deleted" });
};
