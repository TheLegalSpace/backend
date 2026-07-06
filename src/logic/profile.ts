import { prisma } from "../config/database";
import {
  response,
  notFound,
  forbidden,
  badRequest,
  conflict,
} from "../helpers/utility";
import { Response } from "../interface";
import {
  findAccountById,
  updateAccount,
} from "../dao/account";
import { totalUnreadMessagesForAccount } from "../dao/conversation";
import { countPendingLeads } from "../dao/request";
import {
  updateLawyerProfile,
  updateFirmProfile,
  findConnectionsForAccount,
  countConnectionsForAccount,
  isFollowing,
  applyFeeRangeRollupTx,
} from "../dao/profile";
import { maskAccount } from "../services/anonymity";
import { invalidateAccountCache } from "../middleware/auth";
import { paginate, buildPagination } from "../helpers/pagination";
import {
  practiceAreaLimitForTier,
  PROFESSIONAL_PRACTICE_AREA_LIMIT,
} from "../config/membership";
import {
  uploadToR2,
  MAX_AVATAR_BYTES,
  MAX_ARTICLE_ASSET_BYTES,
} from "../services/storage";

const enrichProfile = async (account: any, viewerId?: string | null) => {
  const masked = maskAccount(account, viewerId);
  let following = false;
  if (viewerId && viewerId !== account.id) {
    following = await isFollowing(viewerId, account.id);
  }
  const practiceAreas = (account.practiceAreaLinks || []).map((l: any) => ({
    ...l.practiceArea,
    minFee: l.feeMin,
    maxFee: l.feeMax,
  }));
  return {
    ...masked,
    isFollowing: following,
    practiceAreas,
    practiceAreaLinks: undefined,
  };
};

export const _getMe = async (accountId: string): Promise<Response> => {
  const account = await findAccountById(accountId);
  if (!account) throw notFound("Account not found");

  const isProfessional = account.role === "LAWYER" || account.role === "FIRM";
  const [profile, unreadMessageCount, pendingLeadCount] = await Promise.all([
    enrichProfile(account, accountId),
    totalUnreadMessagesForAccount(accountId),
    isProfessional ? countPendingLeads(accountId) : Promise.resolve(0),
  ]);

  return response({
    error: false,
    message: "Profile retrieved",
    data: { ...profile, unreadMessageCount, pendingLeadCount },
  });
};

export const _getProfileById = async (
  targetId: string,
  viewerId: string
): Promise<Response> => {
  const account = await findAccountById(targetId);
  if (!account || account.status === "deleted") throw notFound("Profile not found");
  return response({
    error: false,
    message: "Profile retrieved",
    data: await enrichProfile(account, viewerId),
  });
};

export const _updateMe = async (
  accountId: string,
  data: { bio?: string; phone?: string; locationCity?: string; locationCountry?: string }
): Promise<Response> => {
  if (data.bio) {
    const wordCount = data.bio.trim().split(/\s+/).length;
    if (wordCount > 25) throw new Error("Bio cannot exceed 25 words");
  }
  const account = await updateAccount(accountId, data);
  await invalidateAccountCache(account.authUserId);
  return response({ error: false, message: "Profile updated", data: account });
};

export const _toggleAnonymous = async (
  accountId: string,
  isAnonymous: boolean
): Promise<Response> => {
  const before = await prisma.account.findUnique({ where: { id: accountId } });
  if (!before) throw notFound("Account not found");
  if (before.role !== "USER") throw forbidden("Only USER accounts can toggle anonymity");
  const account = await prisma.account.update({
    where: { id: accountId },
    data: { isAnonymous },
  });
  await invalidateAccountCache(account.authUserId);
  return response({ error: false, message: "Anonymity updated", data: account });
};

// "Set up to 3 Practice Areas" is a Professional perk; community accounts are capped lower.
const assertPracticeAreaLimit = (tier: string, ids: string[]) => {
  const limit = practiceAreaLimitForTier(tier);
  if (new Set(ids).size > limit) {
    throw badRequest(
      limit < PROFESSIONAL_PRACTICE_AREA_LIMIT
        ? `Your Community membership allows ${limit} practice area. Upgrade to Professional to set up to ${PROFESSIONAL_PRACTICE_AREA_LIMIT}.`
        : `You can set up to ${PROFESSIONAL_PRACTICE_AREA_LIMIT} practice areas.`
    );
  }
};

export const _updatePracticeAreas = async (
  accountId: string,
  practiceAreas: PracticeAreaFeeInput[]
): Promise<Response> => {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { practiceAreaLinks: true },
  });
  if (!account) throw notFound("Account not found");

  const practiceAreaIds = practiceAreas.map((a) => a.practiceAreaId);
  assertPracticeAreaLimit(account.membershipTier, practiceAreaIds);
  validatePracticeAreaFees(practiceAreas);

  const validAreas = await prisma.practiceArea.findMany({
    where: { id: { in: practiceAreaIds }, isActive: true },
    select: { id: true },
  });
  if (validAreas.length !== new Set(practiceAreaIds).size) {
    throw badRequest("One or more practice areas are invalid or inactive");
  }

  await prisma.$transaction(async (tx) => {
    await tx.accountPracticeArea.deleteMany({ where: { accountId } });
    await tx.accountPracticeArea.createMany({
      data: practiceAreas.map((a) => ({
        accountId,
        practiceAreaId: a.practiceAreaId,
        feeMin: a.minFee,
        feeMax: a.maxFee,
      })),
      skipDuplicates: true,
    });
    await applyFeeRangeRollupTx(tx, accountId, account.role);
  });

  await invalidateAccountCache(account.authUserId);
  const updated = await findAccountById(accountId);
  return response({
    error: false,
    message: "Practice areas updated",
    data: updated,
  });
};

export const _updateLawyer = async (
  accountId: string,
  data: any
): Promise<Response> => {
  const profile = await updateLawyerProfile(accountId, data);
  const account = await findAccountById(accountId);
  if (account) await invalidateAccountCache(account.authUserId);
  return response({ error: false, message: "Lawyer profile updated", data: profile });
};

export const _updateFirm = async (
  accountId: string,
  data: any
): Promise<Response> => {
  const profile = await updateFirmProfile(accountId, data);
  const account = await findAccountById(accountId);
  if (account) await invalidateAccountCache(account.authUserId);
  return response({ error: false, message: "Firm profile updated", data: profile });
};

export const _uploadAvatar = async (
  accountId: string,
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<Response> => {
  const { url } = await uploadToR2({
    buffer,
    mimetype,
    originalName: filename,
    folder: `avatars/${accountId}`,
    maxBytes: MAX_AVATAR_BYTES,
  });
  const account = await updateAccount(accountId, { avatarUrl: url });
  await invalidateAccountCache(account.authUserId);
  return response({ error: false, message: "Avatar uploaded", data: { url, account } });
};

export const _uploadCover = async (
  accountId: string,
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<Response> => {
  const { url } = await uploadToR2({
    buffer,
    mimetype,
    originalName: filename,
    folder: `covers/${accountId}`,
    maxBytes: MAX_AVATAR_BYTES,
  });
  const account = await updateAccount(accountId, { coverUrl: url });
  await invalidateAccountCache(account.authUserId);
  return response({ error: false, message: "Cover uploaded", data: { url, account } });
};

export const _getConnections = async (
  targetId: string,
  viewerId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const total = await countConnectionsForAccount(targetId);
  const { accounts } = await findConnectionsForAccount(targetId, skip, take);
  const items = accounts.map((a) => maskAccount(a as any, viewerId));
  return response({
    error: false,
    message: "Connections retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

export const _getProfileArticles = async (
  targetId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const where = { authorAccountId: targetId, deletedAt: null, pdfUrl: { not: null } };
  const [items, total] = await Promise.all([
    prisma.post.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.post.count({ where }),
  ]);
  return response({
    error: false,
    message: "Articles retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

export const _getProfileReviews = async (
  targetId: string,
  viewerId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const where = { reviewedAccountId: targetId, deletedAt: null };
  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: { reviewer: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.review.count({ where }),
  ]);
  const items = rows.map((r) => ({
    ...r,
    reviewer: maskAccount(r.reviewer as any, viewerId),
  }));
  return response({
    error: false,
    message: "Reviews retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

export const _getProfilePosts = async (
  targetId: string,
  viewerId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const where = { authorAccountId: targetId, deletedAt: null };
  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: { author: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.post.count({ where }),
  ]);
  const items = rows.map((p) => ({
    ...p,
    author: maskAccount(p.author as any, viewerId),
  }));
  return response({
    error: false,
    message: "Posts retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

interface PracticeAreaFeeInput {
  practiceAreaId: string;
  minFee: number;
  maxFee: number;
}

const validatePracticeAreaFees = (areas: PracticeAreaFeeInput[]) => {
  const seen = new Set<string>();
  for (const a of areas) {
    if (seen.has(a.practiceAreaId)) {
      throw badRequest("Duplicate practice area in the list");
    }
    seen.add(a.practiceAreaId);
    if (a.minFee > a.maxFee) {
      throw badRequest("Minimum fee cannot be greater than maximum fee");
    }
  }
};

// Account-wide rollup from the per-area ranges (coarse budget filter + summary badge).
const rollupFeeRange = (areas: PracticeAreaFeeInput[]) => ({
  feeRangeMin: Math.min(...areas.map((a) => a.minFee)),
  feeRangeMax: Math.max(...areas.map((a) => a.maxFee)),
});

interface LawyerSetupInput {
  firstName: string;
  lastName: string;
  whatsappNumber: string;
  callToBarYear: number;
  locationCity: string;
  locationCountry?: string;
  practiceAreas: PracticeAreaFeeInput[];
}

// Sets the professional account type (LAWYER or FIRM) during onboarding, before
// profile setup. Called when the user picks "Lawyer" or "Firm" on the plan flow so
// the membership module can derive the right plan/price from `account.role`.
// Re-callable (they can change their mind) until either setup completes or a
// professional plan has been paid for — the plan is priced per role.
export const _setProfessionalRole = async (
  accountId: string,
  role: "LAWYER" | "FIRM"
): Promise<Response> => {
  const account = await findAccountById(accountId);
  if (!account) throw notFound("Account not found");

  if (!["PENDING_PROFESSIONAL", "LAWYER", "FIRM"].includes(account.role)) {
    throw forbidden("Only professional accounts can set an account type");
  }
  if (account.lawyerProfile || account.firmProfile) {
    throw conflict("Profile setup is already complete — account type can no longer be changed");
  }

  if (account.role === role) {
    return response({ error: false, message: "Account type set", data: account });
  }

  if (account.membershipTier === "professional") {
    const current = account.role === "LAWYER" ? "lawyer" : "firm";
    throw forbidden(
      `Your professional membership was purchased for a ${current} account. Contact support to change your account type.`
    );
  }

  const updated = await prisma.account.update({
    where: { id: accountId },
    data: { role },
    include: {
      lawyerProfile: true,
      firmProfile: true,
      practiceAreaLinks: { include: { practiceArea: true } },
    },
  });

  await invalidateAccountCache(account.authUserId);
  return response({ error: false, message: "Account type set", data: updated });
};

export const _setupLawyer = async (
  accountId: string,
  body: LawyerSetupInput
): Promise<Response> => {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { lawyerProfile: true },
  });
  if (!account) throw notFound("Account not found");
  if (account.role === "FIRM") {
    throw forbidden("Account type is set to firm — switch your account type before lawyer setup");
  }
  if (account.role !== "PENDING_PROFESSIONAL" && account.role !== "LAWYER") {
    throw forbidden("Account is not awaiting professional setup");
  }
  if (account.lawyerProfile) throw conflict("Lawyer profile already exists");

  const practiceAreaIds = body.practiceAreas.map((a) => a.practiceAreaId);
  assertPracticeAreaLimit(account.membershipTier, practiceAreaIds);
  validatePracticeAreaFees(body.practiceAreas);

  const validAreas = await prisma.practiceArea.findMany({
    where: { id: { in: practiceAreaIds }, isActive: true },
    select: { id: true },
  });
  if (validAreas.length !== new Set(practiceAreaIds).size) {
    throw badRequest("One or more practice areas are invalid or inactive");
  }

  const { feeRangeMin, feeRangeMax } = rollupFeeRange(body.practiceAreas);
  const fullName = `${body.firstName.trim()} ${body.lastName.trim()}`.trim();

  const result = await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: accountId },
      data: {
        role: "LAWYER",
        firstName: body.firstName,
        lastName: body.lastName,
        fullName,
        phone: body.whatsappNumber,
        locationCity: body.locationCity,
        locationCountry: body.locationCountry || "Nigeria",
      },
    });
    await tx.lawyerProfile.create({
      data: {
        accountId,
        callToBarYear: body.callToBarYear,
        feeRangeMin,
        feeRangeMax,
        verificationStatus: "verified",
      },
    });
    await tx.accountPracticeArea.createMany({
      data: body.practiceAreas.map((a) => ({
        accountId,
        practiceAreaId: a.practiceAreaId,
        feeMin: a.minFee,
        feeMax: a.maxFee,
      })),
      skipDuplicates: true,
    });
    return tx.account.findUnique({
      where: { id: accountId },
      include: {
        lawyerProfile: true,
        firmProfile: true,
        practiceAreaLinks: { include: { practiceArea: true } },
      },
    });
  });

  await invalidateAccountCache(account.authUserId);
  return response({
    error: false,
    message: "Lawyer setup complete",
    data: result,
  });
};

interface FirmSetupInput {
  firmName: string;
  whatsappNumber: string;
  officeAddress: string;
  firmEstablishmentYear: number;
  locationCity: string;
  locationCountry?: string;
  practiceAreas: PracticeAreaFeeInput[];
}

export const _setupFirm = async (
  accountId: string,
  body: FirmSetupInput
): Promise<Response> => {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { firmProfile: true },
  });
  if (!account) throw notFound("Account not found");
  if (account.role === "LAWYER") {
    throw forbidden("Account type is set to lawyer — switch your account type before firm setup");
  }
  if (account.role !== "PENDING_PROFESSIONAL" && account.role !== "FIRM") {
    throw forbidden("Account is not awaiting professional setup");
  }
  if (account.firmProfile) throw conflict("Firm profile already exists");

  const practiceAreaIds = body.practiceAreas.map((a) => a.practiceAreaId);
  assertPracticeAreaLimit(account.membershipTier, practiceAreaIds);
  validatePracticeAreaFees(body.practiceAreas);

  const validAreas = await prisma.practiceArea.findMany({
    where: { id: { in: practiceAreaIds }, isActive: true },
    select: { id: true },
  });
  if (validAreas.length !== new Set(practiceAreaIds).size) {
    throw badRequest("One or more practice areas are invalid or inactive");
  }

  const { feeRangeMin, feeRangeMax } = rollupFeeRange(body.practiceAreas);

  const result = await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: accountId },
      data: {
        role: "FIRM",
        fullName: body.firmName,
        phone: body.whatsappNumber,
        locationCity: body.locationCity,
        locationCountry: body.locationCountry || "Nigeria",
      },
    });
    await tx.firmProfile.create({
      data: {
        accountId,
        firmName: body.firmName,
        firmEstablishmentYear: body.firmEstablishmentYear,
        officeAddress: body.officeAddress,
        feeRangeMin,
        feeRangeMax,
        verificationStatus: "verified",
      },
    });
    await tx.accountPracticeArea.createMany({
      data: body.practiceAreas.map((a) => ({
        accountId,
        practiceAreaId: a.practiceAreaId,
        feeMin: a.minFee,
        feeMax: a.maxFee,
      })),
      skipDuplicates: true,
    });
    return tx.account.findUnique({
      where: { id: accountId },
      include: {
        lawyerProfile: true,
        firmProfile: true,
        practiceAreaLinks: { include: { practiceArea: true } },
      },
    });
  });

  await invalidateAccountCache(account.authUserId);
  return response({
    error: false,
    message: "Firm setup complete",
    data: result,
  });
};

const LAWYER_DOC_TYPES = ["call_to_bar_cert", "practicing_cert", "id_card"];
const FIRM_DOC_TYPES = ["cac_cert"];

export const _uploadVerificationDocument = async (
  accountId: string,
  authUserId: string,
  role: string,
  docType: string,
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<Response> => {
  if (role === "LAWYER" && !LAWYER_DOC_TYPES.includes(docType)) {
    throw badRequest(`Lawyer accounts cannot upload docType "${docType}"`);
  }
  if (role === "FIRM" && !FIRM_DOC_TYPES.includes(docType)) {
    throw badRequest(`Firm accounts cannot upload docType "${docType}"`);
  }
  if (role !== "LAWYER" && role !== "FIRM") {
    throw forbidden("Only LAWYER or FIRM accounts can upload verification documents");
  }

  const { key } = await uploadToR2({
    buffer,
    mimetype,
    originalName: filename,
    folder: `verification/${accountId}/${docType}`,
    maxBytes: MAX_ARTICLE_ASSET_BYTES,
    allowPdf: true,
  });

  const doc = await prisma.verificationDocument.create({
    data: {
      accountId,
      docType,
      s3Key: key,
      status: "pending",
    },
  });

  await invalidateAccountCache(authUserId);
  return response({
    error: false,
    message: "Verification document uploaded",
    data: doc,
  });
};
