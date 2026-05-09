import { prisma } from "../config/database";
import { response, notFound, forbidden } from "../helpers/utility";
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
import { uploadToR2, MAX_AVATAR_BYTES } from "../services/storage";

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
  const where = { authorAccountId: targetId, deletedAt: null, status: "published" };
  const [items, total] = await Promise.all([
    prisma.article.findMany({ where, orderBy: { publishedAt: "desc" }, skip, take }),
    prisma.article.count({ where }),
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
      include: { author: true, attachedArticle: true },
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
