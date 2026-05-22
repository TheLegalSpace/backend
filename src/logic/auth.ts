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
    } else {
      throw new Error(created.error.message || "Failed to create auth user");
    }
  }

  const resent = await supabase.auth.resend({ type: "signup", email: body.email });
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
  const resent = await supabase.auth.resend({ type: "signup", email });
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
    throw unauthorized(error?.message || "Invalid or expired verification code");
  }

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
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw new Error(error.message);
  return response({ error: false, message: "Password reset email sent" });
};

export const _resetPassword = async (
  token: string,
  newPassword: string
): Promise<Response> => {
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: token,
    type: "recovery",
  });
  if (error || !data?.session) throw unauthorized(error?.message || "Invalid token");
  const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
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
