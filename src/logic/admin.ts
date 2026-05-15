import { prisma } from "../config/database";
import { response, notFound } from "../helpers/utility";
import { Response } from "../interface";
import {
  listAccounts,
  setAccountStatus,
  setVerificationStatus,
  listKycQueue,
  recordAuditLog,
  listAuditLog,
} from "../dao/admin";
import { paginate, buildPagination } from "../helpers/pagination";
import { dispatchNotification } from "../services/notification";

export const _listAccounts = async (
  filters: any,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { items, total } = await listAccounts(filters, skip, take);
  return response({
    error: false,
    message: "Accounts retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

export const _suspendAccount = async (
  adminId: string,
  accountId: string,
  reason: string
): Promise<Response> => {
  const account = await setAccountStatus(accountId, "suspended");
  await recordAuditLog({
    adminAccountId: adminId,
    action: "account.suspend",
    targetType: "account",
    targetId: accountId,
    reason,
  });
  return response({ error: false, message: "Account suspended", data: account });
};

export const _unsuspendAccount = async (
  adminId: string,
  accountId: string
): Promise<Response> => {
  const account = await setAccountStatus(accountId, "active");
  await recordAuditLog({
    adminAccountId: adminId,
    action: "account.unsuspend",
    targetType: "account",
    targetId: accountId,
  });
  return response({ error: false, message: "Account unsuspended", data: account });
};

export const _kycQueue = async (page: number, limit: number): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { lawyers, firms, total } = await listKycQueue(skip, take);
  return response({
    error: false,
    message: "KYC queue retrieved",
    data: { lawyers, firms, pagination: buildPagination(total, p, l) },
  });
};

export const _approveKyc = async (
  adminId: string,
  accountId: string
): Promise<Response> => {
  const result = await setVerificationStatus(accountId, "verified");
  await recordAuditLog({
    adminAccountId: adminId,
    action: "kyc.approve",
    targetType: "account",
    targetId: accountId,
  });
  await dispatchNotification({
    recipientAccountId: accountId,
    type: "verification_update",
    payload: { status: "verified" },
  });
  return response({ error: false, message: "KYC approved", data: result });
};

export const _rejectKyc = async (
  adminId: string,
  accountId: string,
  reason: string
): Promise<Response> => {
  const result = await setVerificationStatus(accountId, "rejected");
  await recordAuditLog({
    adminAccountId: adminId,
    action: "kyc.reject",
    targetType: "account",
    targetId: accountId,
    reason,
  });
  await dispatchNotification({
    recipientAccountId: accountId,
    type: "verification_update",
    payload: { status: "rejected", reason },
  });
  return response({ error: false, message: "KYC rejected", data: result });
};

export const _deletePost = async (adminId: string, postId: string): Promise<Response> => {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post not found");
  await prisma.post.update({ where: { id: postId }, data: { deletedAt: new Date() } });
  await recordAuditLog({
    adminAccountId: adminId,
    action: "post.delete",
    targetType: "post",
    targetId: postId,
  });
  return response({ error: false, message: "Post deleted" });
};

export const _deleteArticle = async (
  adminId: string,
  articleId: string
): Promise<Response> => {
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) throw notFound("Article not found");
  await prisma.article.update({
    where: { id: articleId },
    data: { deletedAt: new Date() },
  });
  await recordAuditLog({
    adminAccountId: adminId,
    action: "article.delete",
    targetType: "article",
    targetId: articleId,
  });
  return response({ error: false, message: "Article deleted" });
};

export const _deleteReview = async (
  adminId: string,
  reviewId: string
): Promise<Response> => {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw notFound("Review not found");
  await prisma.$transaction(async (tx) => {
    await tx.review.update({
      where: { id: reviewId },
      data: { deletedAt: new Date() },
    });
    const stats = await tx.review.aggregate({
      where: { reviewedAccountId: review.reviewedAccountId, deletedAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.account.update({
      where: { id: review.reviewedAccountId },
      data: {
        avgRating: stats._avg.rating || 0,
        reviewCount: stats._count._all,
      },
    });
  });
  await recordAuditLog({
    adminAccountId: adminId,
    action: "review.delete",
    targetType: "review",
    targetId: reviewId,
  });
  return response({ error: false, message: "Review deleted" });
};

export const _auditLog = async (
  filters: any,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { items, total } = await listAuditLog(filters, skip, take);
  return response({
    error: false,
    message: "Audit log retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};
