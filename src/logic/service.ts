import { prisma } from "../config/database";
import { response, badRequest, notFound, forbidden } from "../helpers/utility";
import { Response } from "../interface";
import { paginate, buildPagination } from "../helpers/pagination";
import { uploadToR2, MAX_AVATAR_BYTES } from "../services/storage";
import { dispatchNotification } from "../services/notification";
import { INQUIRY_TYPES, computePromotionPricing } from "../config/service";
import { CreateInquiryInput, CreateEventPromotionInput } from "../interface/service";
import {
  createServiceRequest,
  findServiceRequestById,
  listServiceRequestsByAccount,
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
    status: "pending",
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

export const _createEventPromotion = async (
  accountId: string,
  input: CreateEventPromotionInput
): Promise<Response> => {
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
    throw badRequest("Valid startAt and endAt dates are required");
  }
  if (endAt < startAt) throw badRequest("endAt must be on or after startAt");

  const { url: flyerUrl } = await uploadToR2({
    buffer: input.flyer.buffer,
    mimetype: input.flyer.mimetype,
    originalName: input.flyer.filename,
    folder: `service/event-promotion/${accountId}`,
    maxBytes: MAX_AVATAR_BYTES,
  });

  const pricing = computePromotionPricing(startAt, endAt, input.shareOnSocial);

  const { serviceRequest, event } = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: input.title,
        coverUrl: flyerUrl,
        startAt,
        endAt,
        registrationUrl: input.links?.[0] ?? null,
        status: "published", // auto-publish (no admin gate for now)
        createdByAdminId: null,
      },
    });
    const serviceRequest = await tx.serviceRequest.create({
      data: {
        accountId,
        type: "event_promotion",
        // PAYMENT TODO: set "pending" and gate the Event on a gateway webhook flipping
        // paymentStatus -> "paid". For now we auto-mark paid and publish immediately.
        status: "active",
        paymentStatus: "paid",
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone ?? null,
        firmName: input.firmName ?? null,
        payload: {
          title: input.title,
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

  await notifySubmitter(accountId, serviceRequest.id, "event_promotion");
  return response({
    error: false,
    message: "Event promotion created",
    data: { serviceRequest, event },
  });
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
