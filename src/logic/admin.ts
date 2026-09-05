import { prisma } from "../config/database";
import { response, notFound, badRequest } from "../helpers/utility";
import { Response } from "../interface";
import {
  listAccounts,
  setAccountStatus,
  setVerificationStatus,
  listKycQueue,
  recordAuditLog,
  listAuditLog,
  listVerificationDocuments,
} from "../dao/admin";
import { signedFileUrl } from "../services/storage";
import { paginate, buildPagination } from "../helpers/pagination";
import { dispatchNotification } from "../services/notification";
import {
  listServiceRequests,
  findServiceRequestById,
  updateServiceRequestStatus,
  listPromotions,
  promotionStats,
} from "../dao/service";
import { listEventsAdmin } from "../dao/event";
import { findDeletionRecordByAccountId } from "../dao/accountDeletionRecord";
import { closeReportsForDeletedPost } from "../dao/postReport";
import { listAllPlans, getPlanById, updatePlan } from "../dao/membership";
import { createPlan } from "../services/paystack";
import { uploadToR2, MAX_AVATAR_BYTES } from "../services/storage";
import { computePromotionPricing } from "../config/service";
import {
  sumDauBetween,
  activeCountByRole,
  activeCountByCity,
} from "../dao/analytics";
import { env } from "../config/env";

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

/**
 * The identity behind a deleted account, for a dispute or a complaint.
 *
 * Reading it is itself audited. This is retained personal data held under a
 * legal-claim basis, so who looked and when is part of what makes holding it
 * defensible — and a GET with a side effect is the right trade here.
 */
export const _accountDeletionRecord = async (
  adminId: string,
  accountId: string
): Promise<Response> => {
  const record = await findDeletionRecordByAccountId(accountId);
  if (!record) throw notFound("No deletion record for this account");

  await recordAuditLog({
    adminAccountId: adminId,
    action: "account.deletion_record.view",
    targetType: "account",
    targetId: accountId,
  });

  return response({
    error: false,
    message: "Deletion record retrieved",
    data: record,
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
  // Force-deleting a post also settles any open reports against it.
  await closeReportsForDeletedPost(postId, adminId);
  await recordAuditLog({
    adminAccountId: adminId,
    action: "post.delete",
    targetType: "post",
    targetId: postId,
  });
  return response({ error: false, message: "Post deleted" });
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

export const _verificationDocuments = async (
  accountId: string
): Promise<Response> => {
  const docs = await listVerificationDocuments(accountId);
  const items = docs.map((d) => ({
    id: d.id,
    docType: d.docType,
    status: d.status,
    url: signedFileUrl(d.s3Key),
    createdAt: d.createdAt,
  }));
  return response({
    error: false,
    message: "Verification documents retrieved",
    data: { items },
  });
};

export const _listPlans = async (): Promise<Response> => {
  const plans = await listAllPlans();
  return response({ error: false, message: "Plans retrieved", data: { items: plans } });
};

export const _updatePlan = async (
  adminId: string,
  id: string,
  data: { name?: string; priceKobo?: number; features?: string[]; isActive?: boolean }
): Promise<Response> => {
  const plan = await getPlanById(id);
  if (!plan) throw notFound("Plan not found");

  const patch: Record<string, any> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.features !== undefined) patch.features = data.features;
  if (data.isActive !== undefined) patch.isActive = data.isActive;

  // A price change can't be applied to an existing Paystack plan (active subscribers
  // are locked to the old amount). Register a fresh Paystack plan and repoint the row —
  // existing subscribers keep their old billing until they resubscribe; new checkouts
  // use the new code. Free (community) plans have no Paystack plan.
  if (data.priceKobo !== undefined && data.priceKobo !== plan.priceKobo) {
    patch.priceKobo = data.priceKobo;
    if (data.priceKobo > 0 && env.paystackSecretKey) {
      try {
        const { plan_code } = await createPlan({
          name: data.name || plan.name,
          amountKobo: data.priceKobo,
          intervalMonths: plan.intervalMonths,
        });
        patch.paystackPlanCode = plan_code;
      } catch (err: any) {
        console.warn(`[admin] Paystack plan re-register failed for ${plan.code}: ${err?.message}`);
      }
    }
  }

  const updated = await updatePlan(id, patch);
  await recordAuditLog({
    adminAccountId: adminId,
    action: "plan.update",
    targetType: "plan",
    targetId: id,
    metadata: patch,
  });
  return response({ error: false, message: "Plan updated", data: updated });
};

// ---- On The Docket (event promotions) ----

export const _listDocket = async (
  filters: { eventStatus?: string; paymentStatus?: string },
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const [{ items, total }, stats] = await Promise.all([
    listPromotions(filters, skip, take),
    promotionStats(),
  ]);
  return response({
    error: false,
    message: "Docket retrieved",
    data: {
      items,
      stats: {
        totalEvents: Object.values(stats.statusCounts).reduce((a, b) => a + b, 0),
        pendingEvents: stats.statusCounts.pending_review || 0,
        approvedEvents: stats.statusCounts.published || 0,
        revenueGeneratedKobo: stats.revenueKobo,
      },
      pagination: buildPagination(total, p, l),
    },
  });
};

// Approximate ad-performance metrics for a promoted event. Views ≈ active users
// over the promotion window (impressions proxy — the flyer is shown to everyone
// logged in); clicks are real (the /events/:id/click beacon). Device breakdown
// isn't tracked. All flagged `approximate: true` so the UI can caveat it.
const computePromotionMetrics = async (event: any, amountKobo: number) => {
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const now = new Date();
  const windowStart = startOfDay(new Date(event.startAt));
  const rawEnd = event.endAt ? new Date(event.endAt) : now;
  const windowEnd = startOfDay(rawEnd < now ? rawEnd : now);

  const [totalViews, byRole, byCity] = await Promise.all([
    sumDauBetween(windowStart, windowEnd),
    activeCountByRole(windowStart),
    activeCountByCity(windowStart, 5),
  ]);

  const totalClicks = event.clickCount || 0;
  const audienceTotal = Object.values(byRole).reduce((a: number, b: number) => a + b, 0);
  const pct = (n: number, total: number) => (total > 0 ? Number(((n / total) * 100).toFixed(1)) : 0);

  const lawyers = byRole.LAWYER || 0;
  const firms = byRole.FIRM || 0;
  const clients = (byRole.USER || 0) + (byRole.PENDING_PROFESSIONAL || 0);

  return {
    approximate: true,
    totalViews,
    totalClicks,
    ctr: totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(2)) : 0,
    costPerClickKobo: totalClicks > 0 ? Math.round(amountKobo / totalClicks) : 0,
    audience: {
      byUserType: {
        lawyers: { count: lawyers, percentage: pct(lawyers, audienceTotal) },
        clients: { count: clients, percentage: pct(clients, audienceTotal) },
        lawFirms: { count: firms, percentage: pct(firms, audienceTotal) },
      },
      byGeography: byCity.map((c) => ({
        city: c.city,
        count: c.count,
        percentage: pct(c.count, audienceTotal),
      })),
      byDevice: null, // not tracked — requires client-side instrumentation
    },
  };
};

// Admin: every event, all statuses, event-centric (covers both promotion and
// editorial events). Stats mirror the docket cards (all events counted by status).
export const _listAllEvents = async (
  filters: { status?: string; q?: string },
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const [{ items, total }, stats] = await Promise.all([
    listEventsAdmin(filters, skip, take),
    promotionStats(),
  ]);
  return response({
    error: false,
    message: "Events retrieved",
    data: {
      items,
      stats: {
        totalEvents: Object.values(stats.statusCounts).reduce((a, b) => a + b, 0),
        pendingEvents: stats.statusCounts.pending_review || 0,
        approvedEvents: stats.statusCounts.published || 0,
        revenueGeneratedKobo: stats.revenueKobo,
      },
      pagination: buildPagination(total, p, l),
    },
  });
};

export const _getDocketItem = async (id: string): Promise<Response> => {
  const sr = await findServiceRequestById(id);
  if (!sr || sr.type !== "event_promotion") throw notFound("Promotion not found");
  const metrics = sr.event
    ? await computePromotionMetrics(sr.event, sr.amount || 0)
    : null;
  return response({
    error: false,
    message: "Promotion retrieved",
    data: { ...sr, metrics },
  });
};

export const _approveDocket = async (
  adminId: string,
  id: string
): Promise<Response> => {
  const sr = await findServiceRequestById(id);
  if (!sr || sr.type !== "event_promotion") throw notFound("Promotion not found");
  if (sr.paymentStatus !== "paid") throw badRequest("Promotion is not paid yet");
  if (!sr.eventId) throw badRequest("Promotion has no linked event");

  const [, updated] = await prisma.$transaction([
    prisma.serviceRequest.update({ where: { id }, data: { status: "active" } }),
    prisma.event.update({ where: { id: sr.eventId }, data: { status: "published" } }),
  ]);
  await recordAuditLog({
    adminAccountId: adminId,
    action: "docket.approve",
    targetType: "event",
    targetId: sr.eventId,
  });
  await dispatchNotification({
    recipientAccountId: sr.accountId,
    type: "system",
    payload: { kind: "event_promotion_approved", eventId: sr.eventId, title: updated.title },
    emailable: true,
  });
  return response({ error: false, message: "Promotion approved", data: updated });
};

export const _rejectDocket = async (
  adminId: string,
  id: string,
  reason: string
): Promise<Response> => {
  const sr = await findServiceRequestById(id);
  if (!sr || sr.type !== "event_promotion") throw notFound("Promotion not found");
  if (!sr.eventId) throw badRequest("Promotion has no linked event");

  const updated = await prisma.event.update({
    where: { id: sr.eventId },
    data: { status: "rejected" },
  });
  await recordAuditLog({
    adminAccountId: adminId,
    action: "docket.reject",
    targetType: "event",
    targetId: sr.eventId,
    reason,
  });
  // Refunds are handled manually for now — surface that in the notification.
  await dispatchNotification({
    recipientAccountId: sr.accountId,
    type: "system",
    payload: {
      kind: "event_promotion_rejected",
      eventId: sr.eventId,
      title: updated.title,
      reason,
      refund: sr.paymentStatus === "paid" ? "manual_pending" : "not_applicable",
    },
    emailable: true,
  });
  return response({ error: false, message: "Promotion rejected", data: updated });
};

// Admin manual "Add Event" — creates a promotion on behalf of an organizer whose
// payment was collected offline (e.g. bank transfer). Publishes immediately.
export const _adminCreatePromotion = async (
  adminId: string,
  input: {
    title: string;
    address?: string;
    startAt: string;
    endAt: string;
    shareOnSocial: boolean;
    links?: string[];
    contactName?: string;
    contactEmail: string;
    contactPhone?: string;
    firmName?: string;
    flyer: { buffer: Buffer; mimetype: string; filename: string };
  }
): Promise<Response> => {
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
    throw badRequest("Valid startAt and endAt dates are required");
  }
  if (endAt < startAt) throw badRequest("endAt must be on or after startAt");

  const address = input.address?.trim() || null;
  const { url: flyerUrl } = await uploadToR2({
    buffer: input.flyer.buffer,
    mimetype: input.flyer.mimetype,
    originalName: input.flyer.filename,
    folder: `service/event-promotion/admin/${adminId}`,
    maxBytes: MAX_AVATAR_BYTES,
  });
  const pricing = computePromotionPricing(startAt, endAt, input.shareOnSocial);

  const { serviceRequest, event } = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: input.title,
        location: address,
        coverUrl: flyerUrl,
        startAt,
        endAt,
        registrationUrl: input.links?.[0] ?? null,
        status: "published",
        createdByAdminId: adminId,
      },
    });
    const serviceRequest = await tx.serviceRequest.create({
      data: {
        accountId: adminId, // FK owner is the creating admin; organizer is in contact fields
        type: "event_promotion",
        status: "active",
        paymentStatus: "paid",
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone ?? null,
        firmName: input.firmName ?? null,
        payload: {
          title: input.title,
          address,
          startAt: input.startAt,
          endAt: input.endAt,
          shareOnSocial: input.shareOnSocial,
          links: input.links ?? [],
          flyerUrl,
          payment: { method: "manual", channel: "bank_transfer", amountKobo: pricing.totalKobo },
        },
        amount: pricing.totalKobo,
        pricing: pricing as any,
        eventId: event.id,
      },
    });
    return { serviceRequest, event };
  });

  await recordAuditLog({
    adminAccountId: adminId,
    action: "docket.create",
    targetType: "event",
    targetId: event.id,
    metadata: { manual: true },
  });
  return response({
    error: false,
    message: "Promotion created and published",
    data: { serviceRequest, event },
  });
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

export const _listServiceRequests = async (
  filters: { type?: string; status?: string },
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { items, total } = await listServiceRequests(filters, skip, take);
  return response({
    error: false,
    message: "Service requests retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

export const _getServiceRequestAdmin = async (id: string): Promise<Response> => {
  const sr = await findServiceRequestById(id);
  if (!sr) throw notFound("Service request not found");
  return response({ error: false, message: "Service request retrieved", data: sr });
};

export const _updateServiceRequestStatus = async (
  adminId: string,
  id: string,
  status: string,
  note?: string
): Promise<Response> => {
  const sr = await findServiceRequestById(id);
  if (!sr) throw notFound("Service request not found");
  const updated = await updateServiceRequestStatus(id, status);
  await recordAuditLog({
    adminAccountId: adminId,
    action: "service_request.update",
    targetType: "service_request",
    targetId: id,
    reason: note,
    metadata: { status },
  });
  return response({ error: false, message: "Service request updated", data: updated });
};
