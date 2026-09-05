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
import { applyFeeVisibility } from "../services/feeVisibility";
import { visiblePostWhere, moderationStatusFor } from "../dao/post";
import { invalidateAccountCache } from "../middleware/auth";
import { paginate, buildPagination } from "../helpers/pagination";
import {
  practiceAreaLimitFor,
  professionalPracticeAreaLimit,
} from "../config/membership";
import {
  INITIAL_VERIFICATION_STATUS,
  UNDER_REVIEW_STATUS,
  DOC_TYPE_LABELS,
  allowedDocTypes,
  requiredDocTypes,
} from "../config/verification";
import { setVerificationStatus, listVerificationDocuments } from "../dao/admin";
import { redis } from "../config/redis";
import {
  uploadToR2,
  MAX_AVATAR_BYTES,
  MAX_ARTICLE_ASSET_BYTES,
} from "../services/storage";

const enrichProfile = async (
  account: any,
  viewerId?: string | null,
  viewerRole?: string | null
) => {
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
  const enriched = {
    ...masked,
    isFollowing: following,
    practiceAreas,
    practiceAreaLinks: undefined,
  };
  // Fees are visible to the owner, to admins, and to anyone with a real link to
  // this account (a live match offer, a request, a connection). A cold profile
  // visit gets the profile without the price list — otherwise the per-area fees
  // are readable for any lawyer whose name you can guess, and the matching
  // cooldown protects nothing.
  return applyFeeVisibility(enriched, viewerId, viewerRole);
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
    data: {
      ...profile,
      unreadMessageCount,
      pendingLeadCount,
      // How many practice areas this account may list (lawyer 2 / firm 7 on
      // Professional, 1 on Community). Exposed so the setup wizard caps the
      // picker at the same number the API enforces instead of hardcoding it.
      practiceAreaLimit: practiceAreaLimitFor(account.membershipTier, account.role),
    },
  });
};

export const _getProfileById = async (
  targetId: string,
  viewerId: string,
  viewerRole?: string | null
): Promise<Response> => {
  const account = await findAccountById(targetId);
  if (!account || account.status === "deleted") throw notFound("Profile not found");
  return response({
    error: false,
    message: "Profile retrieved",
    data: await enrichProfile(account, viewerId, viewerRole),
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

// Multiple practice areas are a Professional perk, and the allowance depends on
// the account type — a firm covers more ground than a solo lawyer (lawyer 2,
// firm 7). Community accounts of either type get one primary area.
const assertPracticeAreaLimit = (tier: string, role: string, ids: string[]) => {
  const limit = practiceAreaLimitFor(tier, role);
  const count = new Set(ids).size;
  if (count <= limit) return;

  const professionalLimit = professionalPracticeAreaLimit(role);
  throw badRequest(
    tier === "professional"
      ? `Your Professional membership allows up to ${professionalLimit} practice ${plural(
          professionalLimit,
          "area"
        )}. You selected ${count}.`
      : `Your Community membership allows ${limit} practice ${plural(
          limit,
          "area"
        )}. Upgrade to Professional to set up to ${professionalLimit}.`
  );
};

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

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
  assertPracticeAreaLimit(account.membershipTier, account.role, practiceAreaIds);
  const normalizedAreas = normalizePracticeAreaFees(practiceAreas);

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
      data: normalizedAreas.map((a) => ({
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
  const items = accounts.map((a) =>
    applyFeeVisibility(maskAccount(a as any, viewerId), viewerId)
  );
  return response({
    error: false,
    message: "Connections retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

export const _getProfileArticles = async (
  targetId: string,
  viewerId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const where = {
    authorAccountId: targetId,
    pdfUrl: { not: null },
    ...visiblePostWhere(viewerId),
  };
  const [rows, total] = await Promise.all([
    prisma.post.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.post.count({ where }),
  ]);
  const items = rows.map((p) => ({
    ...p,
    moderationStatus: moderationStatusFor(p, viewerId),
  }));
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
  const where = { authorAccountId: targetId, ...visiblePostWhere(viewerId) };
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
    author: applyFeeVisibility(maskAccount(p.author as any, viewerId), viewerId),
    moderationStatus: moderationStatusFor(p, viewerId),
  }));
  return response({
    error: false,
    message: "Posts retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

interface PracticeAreaFeeInput {
  practiceAreaId: string;
  minFee?: number | null;
  maxFee?: number | null;
}

interface PracticeAreaFee {
  practiceAreaId: string;
  minFee: number;
  maxFee: number;
}

/**
 * Fees are per-area but only *one* of them has to be filled in.
 *
 * Making every area mandatory meant a firm with seven specialisms had to price
 * all seven before it could finish signing up — people abandoned the wizard
 * there. One stated fee is enough to drive the matchmaking budget filter; the
 * rest can be left blank (stored as 0 = "not stated") and priced later from the
 * profile. Giving only one side of a range is read as a single flat fee.
 */
const normalizePracticeAreaFees = (areas: PracticeAreaFeeInput[]): PracticeAreaFee[] => {
  const seen = new Set<string>();
  const normalized: PracticeAreaFee[] = [];

  for (const a of areas) {
    if (seen.has(a.practiceAreaId)) {
      throw badRequest("Duplicate practice area in the list");
    }
    seen.add(a.practiceAreaId);

    let minFee = Math.max(0, Math.trunc(a.minFee ?? 0));
    let maxFee = Math.max(0, Math.trunc(a.maxFee ?? 0));
    if (minFee > 0 && maxFee === 0) maxFee = minFee;
    if (maxFee > 0 && minFee === 0) minFee = maxFee;
    if (minFee > maxFee) {
      throw badRequest("Minimum fee cannot be greater than maximum fee");
    }
    normalized.push({ practiceAreaId: a.practiceAreaId, minFee, maxFee });
  }

  if (!normalized.some((a) => a.maxFee > 0)) {
    throw badRequest(
      "Add a fee for at least one practice area so clients can be matched to your budget range"
    );
  }
  return normalized;
};

// Account-wide rollup from the per-area ranges (coarse budget filter + summary
// badge). Unpriced areas are skipped so a blank one can't zero out the minimum.
const rollupFeeRange = (areas: PracticeAreaFee[]) => {
  const priced = areas.filter((a) => a.maxFee > 0);
  return {
    feeRangeMin: Math.min(...priced.map((a) => a.minFee)),
    feeRangeMax: Math.max(...priced.map((a) => a.maxFee)),
  };
};

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
  // The account is still PENDING_PROFESSIONAL here — the limit that matters is
  // the one for the role being set up, not the placeholder role on the row.
  assertPracticeAreaLimit(account.membershipTier, "LAWYER", practiceAreaIds);
  const normalizedAreas = normalizePracticeAreaFees(body.practiceAreas);

  const validAreas = await prisma.practiceArea.findMany({
    where: { id: { in: practiceAreaIds }, isActive: true },
    select: { id: true },
  });
  if (validAreas.length !== new Set(practiceAreaIds).size) {
    throw badRequest("One or more practice areas are invalid or inactive");
  }

  const { feeRangeMin, feeRangeMax } = rollupFeeRange(normalizedAreas);
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
        // Starts unverified — the wizard's last step tells them their profile is
        // "under review", and it has to actually be true. Uploading the required
        // document moves this to `under_review`, which is what the admin KYC
        // queue filters on. See INITIAL_VERIFICATION_STATUS.
        verificationStatus: INITIAL_VERIFICATION_STATUS,
      },
    });
    await tx.accountPracticeArea.createMany({
      data: normalizedAreas.map((a) => ({
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
  // The wizard payload has landed for real — the draft has nothing left to restore.
  await redis.del(onboardingDraftKey(accountId)).catch(() => null);
  return response({
    error: false,
    message: "Lawyer setup complete",
    data: result,
  });
};

interface FirmSetupInput {
  firmName: string;
  whatsappNumber: string;
  officeAddress?: string;
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
  assertPracticeAreaLimit(account.membershipTier, "FIRM", practiceAreaIds);
  const normalizedAreas = normalizePracticeAreaFees(body.practiceAreas);

  const validAreas = await prisma.practiceArea.findMany({
    where: { id: { in: practiceAreaIds }, isActive: true },
    select: { id: true },
  });
  if (validAreas.length !== new Set(practiceAreaIds).size) {
    throw badRequest("One or more practice areas are invalid or inactive");
  }

  const { feeRangeMin, feeRangeMax } = rollupFeeRange(normalizedAreas);

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
        officeAddress: body.officeAddress || null,
        feeRangeMin,
        feeRangeMax,
        verificationStatus: INITIAL_VERIFICATION_STATUS,
      },
    });
    await tx.accountPracticeArea.createMany({
      data: normalizedAreas.map((a) => ({
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
  await redis.del(onboardingDraftKey(accountId)).catch(() => null);
  return response({
    error: false,
    message: "Firm setup complete",
    data: result,
  });
};

const verificationStatusOf = (account: any): string =>
  account?.lawyerProfile?.verificationStatus ||
  account?.firmProfile?.verificationStatus ||
  INITIAL_VERIFICATION_STATUS;

/**
 * What the "Verify Your Professional Status" step and the profile badge need in
 * one call: the current status, which documents this role owes us, and what has
 * already been received.
 *
 * `canSubmitForReview` is false once the account is already `under_review` or
 * decided — re-uploading after an admin has ruled shouldn't silently reopen the
 * case.
 */
export const _getVerificationState = async (accountId: string): Promise<Response> => {
  const account = await findAccountById(accountId);
  if (!account) throw notFound("Account not found");
  if (account.role !== "LAWYER" && account.role !== "FIRM") {
    throw forbidden("Only LAWYER or FIRM accounts have a verification state");
  }

  const docs = await listVerificationDocuments(accountId);
  const uploadedTypes = new Set(docs.map((d: any) => d.docType));
  const required = requiredDocTypes(account.role);
  const status = verificationStatusOf(account);

  return response({
    error: false,
    message: "Verification state retrieved",
    data: {
      status,
      requiredDocTypes: required.map((t) => ({
        docType: t,
        label: DOC_TYPE_LABELS[t] || t,
        uploaded: uploadedTypes.has(t),
      })),
      optionalDocTypes: allowedDocTypes(account.role)
        .filter((t) => !required.includes(t))
        .map((t) => ({
          docType: t,
          label: DOC_TYPE_LABELS[t] || t,
          uploaded: uploadedTypes.has(t),
        })),
      missingDocTypes: required.filter((t) => !uploadedTypes.has(t)),
      uploaded: docs.map((d: any) => ({
        id: d.id,
        docType: d.docType,
        label: DOC_TYPE_LABELS[d.docType] || d.docType,
        status: d.status,
        rejectionReason: d.rejectionReason,
        createdAt: d.createdAt,
      })),
      canSubmitForReview: status === INITIAL_VERIFICATION_STATUS,
    },
  });
};

export const _uploadVerificationDocument = async (
  accountId: string,
  authUserId: string,
  role: string,
  docType: string,
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<Response> => {
  if (role !== "LAWYER" && role !== "FIRM") {
    throw forbidden("Only LAWYER or FIRM accounts can upload verification documents");
  }
  if (!allowedDocTypes(role).includes(docType)) {
    throw badRequest(`${role === "FIRM" ? "Firm" : "Lawyer"} accounts cannot upload docType "${docType}"`);
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

  // The transition that actually matters: once every required document for the
  // role is in, the profile moves `pending` -> `under_review`, which is the only
  // status `listKycQueue` selects. Without this the upload is a dead end — the
  // wizard promises a review nobody is queued for.
  //
  // Only ever moves forward from `pending`. An account an admin has already
  // ruled on is not reopened by an upload; that's an admin decision.
  const account = await findAccountById(accountId);
  const status = verificationStatusOf(account);
  let submittedForReview = false;

  if (status === INITIAL_VERIFICATION_STATUS) {
    const docs = await listVerificationDocuments(accountId);
    const uploadedTypes = new Set(docs.map((d: any) => d.docType));
    const missing = requiredDocTypes(role).filter((t) => !uploadedTypes.has(t));
    if (missing.length === 0) {
      await setVerificationStatus(accountId, UNDER_REVIEW_STATUS);
      submittedForReview = true;
    }
  }

  await invalidateAccountCache(authUserId);
  return response({
    error: false,
    message: submittedForReview
      ? "Document uploaded — your profile has been submitted for review"
      : "Verification document uploaded",
    data: {
      document: doc,
      verificationStatus: submittedForReview ? UNDER_REVIEW_STATUS : status,
      submittedForReview,
    },
  });
};

/**
 * Onboarding draft — the partial state behind the wizard's "Save & Continue".
 *
 * The setup call (`POST /profile/me/{lawyer,firm}/setup`) is deliberately
 * atomic: it creates the account role, the satellite profile and the practice
 * areas in one transaction, so there is no half-built professional account. But
 * the design collects that payload across three screens ("Tell Us About
 * Yourself" -> "Professional Information" -> "Professional Fees"), and the
 * Professional path additionally leaves the site for Paystack in between.
 *
 * So the steps write here, and only the final screen submits to `setup`. Redis
 * rather than a table: it's throwaway state with a natural expiry, and it
 * mirrors `matchmaking/intake`, which solves the same problem for the client
 * intake wizard.
 *
 * TTL is a week — long enough to survive a Paystack round-trip, a closed tab, or
 * someone finishing on a different device tomorrow.
 */
const ONBOARDING_DRAFT_TTL = 7 * 24 * 60 * 60;
// The real setup payload is a few hundred bytes; 32KB is generous. The body is
// open-ended by design, so it needs a ceiling — otherwise the endpoint is a free
// Redis write of arbitrary size for any authenticated account.
const MAX_ONBOARDING_DRAFT_BYTES = 32 * 1024;
const onboardingDraftKey = (accountId: string) => `onboarding:draft:${accountId}`;

export const _saveOnboardingDraft = async (
  accountId: string,
  partial: Record<string, any>
): Promise<Response> => {
  const existing = await redis.get(onboardingDraftKey(accountId)).catch(() => null);
  let merged: Record<string, any> = {};
  if (existing) {
    try {
      merged = JSON.parse(existing);
    } catch {}
  }
  // Shallow merge so a step only overwrites its own fields — "Professional Fees"
  // must not wipe what "Tell Us About Yourself" saved.
  merged = { ...merged, ...partial, updatedAt: new Date().toISOString() };

  const serialized = JSON.stringify(merged);
  if (Buffer.byteLength(serialized, "utf8") > MAX_ONBOARDING_DRAFT_BYTES) {
    throw badRequest("Onboarding draft is too large");
  }

  await redis
    .set(onboardingDraftKey(accountId), serialized, "EX", ONBOARDING_DRAFT_TTL)
    .catch(() => null);
  return response({ error: false, message: "Draft saved", data: merged });
};

export const _getOnboardingDraft = async (accountId: string): Promise<Response> => {
  const cached = await redis.get(onboardingDraftKey(accountId)).catch(() => null);
  if (!cached) {
    return response({ error: false, message: "Draft retrieved", data: {} });
  }
  try {
    return response({
      error: false,
      message: "Draft retrieved",
      data: JSON.parse(cached),
    });
  } catch {
    return response({ error: false, message: "Draft retrieved", data: {} });
  }
};

export const _clearOnboardingDraft = async (accountId: string): Promise<Response> => {
  await redis.del(onboardingDraftKey(accountId)).catch(() => null);
  return response({ error: false, message: "Draft cleared" });
};
