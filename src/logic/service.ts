import { prisma } from "../config/database";
import { response, badRequest, notFound, forbidden } from "../helpers/utility";
import { Response } from "../interface";
import { paginate, buildPagination } from "../helpers/pagination";
import { uploadToR2, MAX_AVATAR_BYTES } from "../services/storage";
import { dispatchNotification } from "../services/notification";
import { INQUIRY_TYPES, computePromotionPricing } from "../config/service";
import { CreateInquiryInput, CreateEventPromotionInput } from "../interface/service";
import { env } from "../config/env";
import * as paystack from "../services/paystack";
import {
  createServiceRequest,
  findServiceRequestById,
  listServiceRequestsByAccount,
  updateServiceRequest,
} from "../dao/service";

const notifySubmitter = async (accountId: string, serviceRequestId: string, type: string) => {
  await dispatchNotification({
    recipientAccountId: accountId,
    type: "service_request_received",
    payload: { serviceRequestId, serviceType: type },
    emailable: true,
  });
  // TLS-team email (EVENTS_INBOX_EMAIL via Brevo) is a TODO pending Brevo setup.
  // The admin list (GET /admin/service-requests) is the channel until then.
};

export const _createInquiry = async (
  accountId: string,
  input: CreateInquiryInput
): Promise<Response> => {
  if (!INQUIRY_TYPES.includes(input.type)) {
    throw badRequest("Invalid service type for this endpoint");
  }
  const sr = await createServiceRequest({
    accountId,
    type: input.type,
    status: "new",
    paymentStatus: "not_required",
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone ?? null,
    firmName: input.firmName ?? null,
    payload: input.payload ?? {},
  });
  await notifySubmitter(accountId, sr.id, input.type);
  return response({ error: false, message: "Service request submitted", data: sr });
};

// Resolve the Paystack redirect target for a promotion checkout. Mirrors the
// membership open-redirect guard: only our frontend origin, configured allowed
// origins, or localhost (dev) are permitted.
const resolvePromotionCallback = (raw?: string): string => {
  if (!raw) return new URL("/services/event-promotion/callback", env.frontendUrl).toString();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest("callbackUrl must be an absolute URL");
  }
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const allowed =
    isLocalhost ||
    url.origin === new URL(env.frontendUrl).origin ||
    env.frontendAllowedOrigins.includes(url.origin);
  if (!allowed) throw badRequest("callbackUrl origin is not allowed");
  return url.toString();
};

export const _createEventPromotion = async (
  accountId: string,
  input: CreateEventPromotionInput,
  callbackUrl?: string
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
    folder: `service/event-promotion/${accountId}`,
    maxBytes: MAX_AVATAR_BYTES,
  });

  const pricing = computePromotionPricing(startAt, endAt, input.shareOnSocial);

  // Create the Event as pending_payment (hidden from the feed, which only shows
  // 'published') and the ServiceRequest as pending. The Event goes to
  // pending_review on payment, then published on admin approval.
  const { serviceRequest, event } = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: input.title,
        location: address,
        coverUrl: flyerUrl,
        startAt,
        endAt,
        registrationUrl: input.links?.[0] ?? null,
        status: "pending_payment",
        createdByAdminId: null,
      },
    });
    const serviceRequest = await tx.serviceRequest.create({
      data: {
        accountId,
        type: "event_promotion",
        status: "pending",
        paymentStatus: "pending",
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
        },
        amount: pricing.totalKobo,
        pricing: pricing as any,
        eventId: event.id,
      },
    });
    return { serviceRequest, event };
  });

  // Initialize the one-off Paystack charge. Payment confirmation (webhook or the
  // /verify fallback) flips the promotion to paid and the Event to pending_review.
  const init = await paystack.initializeTransaction({
    email: input.contactEmail,
    amountKobo: pricing.totalKobo,
    callbackUrl: resolvePromotionCallback(callbackUrl),
    metadata: {
      kind: "event_promotion",
      serviceRequestId: serviceRequest.id,
      accountId,
    },
  });

  return response({
    error: false,
    message: "Event promotion created — complete payment to submit for review",
    data: {
      serviceRequest,
      event,
      authorizationUrl: init.authorization_url,
      reference: init.reference,
      accessCode: init.access_code,
    },
  });
};

// Shared confirmation used by both the webhook (charge.success with
// metadata.kind === "event_promotion") and the /verify fallback. Idempotent:
// re-delivery is a no-op once the promotion is already paid. Promotion revenue
// is tracked on ServiceRequest.amount (paid) — deliberately NOT a Payment row,
// so the Revenue page's Subscriptions vs On-The-Docket columns stay separate.
export const activatePromotionFromCharge = async (charge: {
  serviceRequestId: string;
  reference: string;
  amountKobo: number;
  channel?: string | null;
  paidAt?: Date;
}): Promise<void> => {
  const sr = await findServiceRequestById(charge.serviceRequestId);
  if (!sr || sr.type !== "event_promotion") return;
  if (sr.paymentStatus === "paid") return; // already processed

  const paidAt = charge.paidAt ?? new Date();
  const payload = { ...((sr.payload as any) || {}) };
  payload.payment = {
    reference: charge.reference,
    amountKobo: charge.amountKobo,
    channel: charge.channel ?? null,
    paidAt: paidAt.toISOString(),
  };

  await prisma.$transaction(async (tx) => {
    await tx.serviceRequest.update({
      where: { id: sr.id },
      data: { paymentStatus: "paid", status: "active", payload },
    });
    if (sr.eventId) {
      await tx.event.update({
        where: { id: sr.eventId },
        data: { status: "pending_review" },
      });
    }
  });

  await dispatchNotification({
    recipientAccountId: sr.accountId,
    type: "service_request_received",
    payload: { serviceRequestId: sr.id, serviceType: "event_promotion", stage: "payment_received" },
    emailable: true,
  });
};

export const _verifyPromotionPayment = async (
  accountId: string,
  reference: string
): Promise<Response> => {
  if (!reference) throw badRequest("reference is required");
  const data = await paystack.verifyTransaction(reference);
  if (data?.status !== "success") throw badRequest("Payment was not successful");
  if (data?.metadata?.kind !== "event_promotion" || !data?.metadata?.serviceRequestId) {
    throw badRequest("This reference is not for an event promotion");
  }

  await activatePromotionFromCharge({
    serviceRequestId: data.metadata.serviceRequestId,
    reference: data.reference,
    amountKobo: data.amount,
    channel: data.channel ?? null,
    paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
  });

  const fresh = await findServiceRequestById(data.metadata.serviceRequestId);
  if (fresh && fresh.accountId !== accountId) {
    throw forbidden("You do not own this service request");
  }
  return response({ error: false, message: "Payment verified", data: fresh });
};

export const _listMyServiceRequests = async (
  accountId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { items, total } = await listServiceRequestsByAccount(accountId, skip, take);
  return response({
    error: false,
    message: "Service requests retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

export const _getServiceRequest = async (
  id: string,
  accountId: string
): Promise<Response> => {
  const sr = await findServiceRequestById(id);
  if (!sr) throw notFound("Service request not found");
  if (sr.accountId !== accountId) throw forbidden("You do not own this service request");
  return response({ error: false, message: "Service request retrieved", data: sr });
};
