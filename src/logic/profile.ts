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
import {
  replacePracticeAreas,
  updateLawyerProfile,
  updateFirmProfile,
  findConnectionsForAccount,
  countConnectionsForAccount,
  isFollowing,
} from "../dao/profile";
import { maskAccount } from "../services/anonymity";
import { invalidateAccountCache } from "../middleware/auth";
import { paginate, buildPagination } from "../helpers/pagination";
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
  const practiceAreas = (account.practiceAreaLinks || []).map((l: any) => l.practiceArea);
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
  return response({
    error: false,
    message: "Profile retrieved",
    data: await enrichProfile(account, accountId),
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

export const _updatePracticeAreas = async (
  accountId: string,
  practiceAreaIds: string[]
): Promise<Response> => {
  await replacePracticeAreas(accountId, practiceAreaIds);
  const account = await findAccountById(accountId);
  if (account) await invalidateAccountCache(account.authUserId);
  return response({
    error: false,
    message: "Practice areas updated",
    data: account,
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

interface ServiceInput {
  practiceAreaId: string;
  name: string;
  price: number;
}

const validateServices = (services: ServiceInput[], practiceAreaIds: string[]) => {
  const areaSet = new Set(practiceAreaIds);
  for (const s of services) {
    if (!areaSet.has(s.practiceAreaId)) {
      throw badRequest(
        `Service "${s.name}" references a practice area not in the selected list`
      );
    }
  }
};

const aggregateFeeRange = (services: ServiceInput[]) => {
  const prices = services.map((s) => s.price);
  return {
    feeRangeMin: Math.min(...prices),
    feeRangeMax: Math.max(...prices),
  };
};

interface LawyerSetupInput {
  firstName: string;
  lastName: string;
  whatsappNumber: string;
  callToBarYear: number;
  locationCity: string;
  locationCountry?: string;
  practiceAreaIds: string[];
  services: ServiceInput[];
}

export const _setupLawyer = async (
  accountId: string,
  body: LawyerSetupInput
): Promise<Response> => {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { lawyerProfile: true },
  });
  if (!account) throw notFound("Account not found");
  if (account.role !== "LAWYER") throw forbidden("Only LAWYER accounts can run lawyer setup");
  if (account.lawyerProfile) throw conflict("Lawyer profile already exists");

  validateServices(body.services, body.practiceAreaIds);

  const validAreas = await prisma.practiceArea.findMany({
    where: { id: { in: body.practiceAreaIds }, isActive: true },
    select: { id: true },
  });
  if (validAreas.length !== body.practiceAreaIds.length) {
    throw badRequest("One or more practice areas are invalid or inactive");
  }

  const { feeRangeMin, feeRangeMax } = aggregateFeeRange(body.services);
  const fullName = `${body.firstName.trim()} ${body.lastName.trim()}`.trim();

  const result = await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: accountId },
      data: {
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
      data: body.practiceAreaIds.map((practiceAreaId) => ({ accountId, practiceAreaId })),
      skipDuplicates: true,
    });
    await tx.serviceOffering.createMany({
      data: body.services.map((s) => ({
        accountId,
        practiceAreaId: s.practiceAreaId,
        name: s.name,
        price: s.price,
      })),
    });
    return tx.account.findUnique({
      where: { id: accountId },
      include: {
        lawyerProfile: true,
        firmProfile: true,
        practiceAreaLinks: { include: { practiceArea: true } },
        serviceOfferings: true,
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
  practiceAreaIds: string[];
  services: ServiceInput[];
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
  if (account.role !== "FIRM") throw forbidden("Only FIRM accounts can run firm setup");
  if (account.firmProfile) throw conflict("Firm profile already exists");

  validateServices(body.services, body.practiceAreaIds);

  const validAreas = await prisma.practiceArea.findMany({
    where: { id: { in: body.practiceAreaIds }, isActive: true },
    select: { id: true },
  });
  if (validAreas.length !== body.practiceAreaIds.length) {
    throw badRequest("One or more practice areas are invalid or inactive");
  }

  const { feeRangeMin, feeRangeMax } = aggregateFeeRange(body.services);

  const result = await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: accountId },
      data: {
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
      data: body.practiceAreaIds.map((practiceAreaId) => ({ accountId, practiceAreaId })),
      skipDuplicates: true,
    });
    await tx.serviceOffering.createMany({
      data: body.services.map((s) => ({
        accountId,
        practiceAreaId: s.practiceAreaId,
        name: s.name,
        price: s.price,
      })),
    });
    return tx.account.findUnique({
      where: { id: accountId },
      include: {
        lawyerProfile: true,
        firmProfile: true,
        practiceAreaLinks: { include: { practiceArea: true } },
        serviceOfferings: true,
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
