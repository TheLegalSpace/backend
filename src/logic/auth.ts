import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { supabase, supabaseAdmin } from "../config/supabase";
import { redis } from "../config/redis";
import { response } from "../helpers/utility";
import { Response } from "../interface";
import {
  findAccountByAuthUserId,
  findAccountByEmail,
  softDeleteAccount,
} from "../dao/account";
import { invalidateAccountCache } from "../middleware/auth";

interface RegisterUserBody {
  authProvider: "email" | "google";
  fullName: string;
  email?: string;
  password?: string;
  idToken?: string;
}

interface RegisterLawyerBody extends RegisterUserBody {
  scn: string;
  callToBarYear: number;
  nbaBranch?: string;
  practiceAreaIds: string[];
  feeRangeMin: number;
  feeRangeMax: number;
  locationCity: string;
  locationCountry?: string;
}

interface RegisterFirmBody {
  authProvider: "email" | "google";
  firmName: string;
  email?: string;
  password?: string;
  idToken?: string;
  rcNumber: string;
  firmEstablishmentYear: number;
  verifyingPartnerScn?: string;
  practiceAreaIds: string[];
  feeRangeMin: number;
  feeRangeMax: number;
  locationCity: string;
  locationCountry?: string;
}

const supabaseSignUp = async (
  email: string,
  password: string
): Promise<{ authUserId: string }> => {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data?.user) {
    throw new Error(error?.message || "Failed to create auth user");
  }
  return { authUserId: data.user.id };
};

const supabaseSignInPassword = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    throw new Error(error?.message || "Login failed");
  }
  return {
    authUserId: data.user.id,
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    },
    email: data.user.email!,
  };
};

const supabaseSignInGoogle = async (idToken: string) => {
  console.log("[AUTH] Google sign-in attempt");
  console.log("[AUTH] Token preview:", idToken.substring(0, 20) + "...[truncated]");
  console.log("[AUTH] Token length:", idToken.length);

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });

  if (error) {
    console.error("[AUTH] Google sign-in error:", {
      message: error.message,
      status: error.status,
      statusCode: (error as any).statusCode,
      fullError: JSON.stringify(error, null, 2),
    });
  }

  if (error || !data?.session) {
    throw new Error(error?.message || "Google sign-in failed");
  }

  console.log("[AUTH] Google sign-in success:", { authUserId: data.user.id });
  return {
    authUserId: data.user.id,
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    },
    email: data.user.email!,
    metadata: data.user.user_metadata || {},
  };
};

const supabaseDeleteUser = async (authUserId: string) => {
  await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => null);
};

const sessionFromSignIn = (s: any) => ({
  accessToken: s.accessToken,
  refreshToken: s.refreshToken,
  expiresAt: s.expiresAt,
});

const buildLoginResponse = async (authUserId: string, session: any) => {
  const account = await findAccountByAuthUserId(authUserId);
  return { account, session };
};

export const _registerUser = async (body: RegisterUserBody): Promise<Response> => {
  if (body.authProvider === "email") {
    if (!body.email || !body.password) throw new Error("Email and password are required");
    const existing = await findAccountByEmail(body.email);
    if (existing) {
      const signed = await supabaseSignInPassword(body.email, body.password);
      const account = await findAccountByAuthUserId(signed.authUserId);
      return response({
        error: false,
        message: "Account already exists — logged in",
        data: { account, session: sessionFromSignIn(signed.session) },
      });
    }
    const { authUserId } = await supabaseSignUp(body.email, body.password);
    try {
      const account = await prisma.account.create({
        data: {
          authUserId,
          email: body.email,
          fullName: body.fullName,
          role: "USER",
          status: "active",
        },
      });
      const signed = await supabaseSignInPassword(body.email, body.password);
      return response({
        error: false,
        message: "Registration successful",
        data: { account, session: sessionFromSignIn(signed.session) },
      });
    } catch (err) {
      await supabaseDeleteUser(authUserId);
      throw err;
    }
  }

  if (body.authProvider === "google") {
    if (!body.idToken) throw new Error("idToken is required");
    console.log("[AUTH] _registerUser Google path");
    const signed = await supabaseSignInGoogle(body.idToken);
    const existing = await findAccountByAuthUserId(signed.authUserId);
    if (existing) {
      console.log("[AUTH] Existing account found, logging in");
      return response({
        error: false,
        message: "Logged in",
        data: { account: existing, session: sessionFromSignIn(signed.session) },
      });
    }
    console.log("[AUTH] New Google account, creating USER");
    const fullName =
      body.fullName ||
      signed.metadata.full_name ||
      signed.metadata.name ||
      signed.email;
    const account = await prisma.account.create({
      data: {
        authUserId: signed.authUserId,
        email: signed.email,
        fullName,
        role: "USER",
        status: "active",
      },
    });
    return response({
      error: false,
      message: "Registration successful",
      data: { account, session: sessionFromSignIn(signed.session) },
    });
  }

  throw new Error("Invalid authProvider");
};

const createLawyerTransaction = async (
  authUserId: string,
  email: string,
  body: RegisterLawyerBody
) => {
  return prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        authUserId,
        email,
        fullName: body.fullName,
        role: "LAWYER",
        status: "active",
        locationCity: body.locationCity,
        locationCountry: body.locationCountry || "Nigeria",
      },
    });
    await tx.lawyerProfile.create({
      data: {
        accountId: account.id,
        scn: body.scn,
        callToBarYear: body.callToBarYear,
        nbaBranch: body.nbaBranch,
        feeRangeMin: body.feeRangeMin,
        feeRangeMax: body.feeRangeMax,
        verificationStatus: "verified",
      },
    });
    await tx.accountPracticeArea.createMany({
      data: body.practiceAreaIds.map((practiceAreaId) => ({
        accountId: account.id,
        practiceAreaId,
      })),
      skipDuplicates: true,
    });
    return tx.account.findUnique({
      where: { id: account.id },
      include: {
        lawyerProfile: true,
        firmProfile: true,
        practiceAreaLinks: { include: { practiceArea: true } },
      },
    });
  });
};

export const _registerLawyer = async (body: RegisterLawyerBody): Promise<Response> => {
  let authUserId = "";
  let email = "";
  let session: any = null;

  if (body.authProvider === "email") {
    if (!body.email || !body.password) throw new Error("Email and password are required");
    const existing = await findAccountByEmail(body.email);
    if (existing) {
      throw new Error("An account with this email already exists");
    }
    const created = await supabaseSignUp(body.email, body.password);
    authUserId = created.authUserId;
    email = body.email;
    const signed = await supabaseSignInPassword(body.email, body.password);
    session = signed.session;
  } else if (body.authProvider === "google") {
    if (!body.idToken) throw new Error("idToken is required");
    console.log("[AUTH] _registerLawyer Google path");
    const signed = await supabaseSignInGoogle(body.idToken);
    authUserId = signed.authUserId;
    email = signed.email;
    session = signed.session;
    const existing = await findAccountByAuthUserId(authUserId);
    if (existing) {
      throw new Error("This Google account is already registered");
    }
  } else {
    throw new Error("Invalid authProvider");
  }

  try {
    const account = await createLawyerTransaction(authUserId, email, body);
    return response({
      error: false,
      message: "Lawyer registered",
      data: { account, session: sessionFromSignIn(session) },
    });
  } catch (err) {
    if (body.authProvider === "email") {
      await supabaseDeleteUser(authUserId);
    }
    throw err;
  }
};

const createFirmTransaction = async (
  authUserId: string,
  email: string,
  body: RegisterFirmBody
) => {
  return prisma.$transaction(async (tx) => {
    let verifyingPartnerAccountId: string | null = null;
    if (body.verifyingPartnerScn) {
      const partner = await tx.lawyerProfile.findUnique({
        where: { scn: body.verifyingPartnerScn },
        select: { accountId: true },
      });
      if (partner) verifyingPartnerAccountId = partner.accountId;
    }
    const account = await tx.account.create({
      data: {
        authUserId,
        email,
        fullName: body.firmName,
        role: "FIRM",
        status: "active",
        locationCity: body.locationCity,
        locationCountry: body.locationCountry || "Nigeria",
      },
    });
    await tx.firmProfile.create({
      data: {
        accountId: account.id,
        firmName: body.firmName,
        rcNumber: body.rcNumber,
        firmEstablishmentYear: body.firmEstablishmentYear,
        verifyingPartnerAccountId,
        verifyingPartnerScn: body.verifyingPartnerScn || null,
        feeRangeMin: body.feeRangeMin,
        feeRangeMax: body.feeRangeMax,
        verificationStatus: "verified",
      },
    });
    await tx.accountPracticeArea.createMany({
      data: body.practiceAreaIds.map((practiceAreaId) => ({
        accountId: account.id,
        practiceAreaId,
      })),
      skipDuplicates: true,
    });
    return tx.account.findUnique({
      where: { id: account.id },
      include: {
        lawyerProfile: true,
        firmProfile: true,
        practiceAreaLinks: { include: { practiceArea: true } },
      },
    });
  });
};

export const _registerFirm = async (body: RegisterFirmBody): Promise<Response> => {
  let authUserId = "";
  let email = "";
  let session: any = null;

  if (body.authProvider === "email") {
    if (!body.email || !body.password) throw new Error("Email and password are required");
    const existing = await findAccountByEmail(body.email);
    if (existing) throw new Error("An account with this email already exists");
    const created = await supabaseSignUp(body.email, body.password);
    authUserId = created.authUserId;
    email = body.email;
    const signed = await supabaseSignInPassword(body.email, body.password);
    session = signed.session;
  } else if (body.authProvider === "google") {
    if (!body.idToken) throw new Error("idToken is required");
    console.log("[AUTH] _registerFirm Google path");
    const signed = await supabaseSignInGoogle(body.idToken);
    authUserId = signed.authUserId;
    email = signed.email;
    session = signed.session;
    const existing = await findAccountByAuthUserId(authUserId);
    if (existing) throw new Error("This Google account is already registered");
  } else {
    throw new Error("Invalid authProvider");
  }

  try {
    const account = await createFirmTransaction(authUserId, email, body);
    return response({
      error: false,
      message: "Firm registered",
      data: { account, session: sessionFromSignIn(session) },
    });
  } catch (err) {
    if (body.authProvider === "email") {
      await supabaseDeleteUser(authUserId);
    }
    throw err;
  }
};

interface LoginBody {
  authProvider: "email" | "google";
  email?: string;
  password?: string;
  idToken?: string;
}

export const _login = async (body: LoginBody): Promise<Response> => {
  let signed: any;
  if (body.authProvider === "email") {
    console.log("[AUTH] Login with email");
    if (!body.email || !body.password) throw new Error("Email and password are required");
    signed = await supabaseSignInPassword(body.email, body.password);
  } else {
    console.log("[AUTH] Login with Google");
    if (!body.idToken) throw new Error("idToken is required");
    signed = await supabaseSignInGoogle(body.idToken);
  }
  const account = await findAccountByAuthUserId(signed.authUserId);
  if (!account) {
    const err: any = new Error("Account not found — please register first");
    err.statusCode = 404;
    throw err;
  }
  console.log("[AUTH] Login successful:", { accountId: account.id });
  await invalidateAccountCache(signed.authUserId);
  return response({
    error: false,
    message: "Login successful",
    data: { account, session: sessionFromSignIn(signed.session) },
  });
};

export const _refresh = async (refreshToken: string): Promise<Response> => {
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data?.session) throw new Error(error?.message || "Refresh failed");
  return response({
    error: false,
    message: "Token refreshed",
    data: {
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
    },
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
  if (error || !data?.session) throw new Error(error?.message || "Invalid token");
  const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updateErr) throw new Error(updateErr.message);
  return response({ error: false, message: "Password reset successful" });
};

export const _deleteAccount = async (
  accountId: string,
  authUserId: string
): Promise<Response> => {
  await softDeleteAccount(accountId);
  await supabaseDeleteUser(authUserId);
  await invalidateAccountCache(authUserId);
  return response({ error: false, message: "Account deleted" });
};
