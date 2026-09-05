import { prisma } from "../config/database";
import {
  response,
  badRequest,
  notFound,
  forbidden,
  conflict,
} from "../helpers/utility";
import { Response } from "../interface";
import {
  createRequest,
  findRequestById,
  listRequests,
  listLeads,
  cancelRequest,
  declineRequest,
  countConsumingRequestsInWindow,
} from "../dao/request";
import {
  findActionableOffer,
  attachRequestToOffer,
  releaseBatchIfSettled,
} from "../dao/matchOffer";
import {
  OFFER_WINDOW_MS,
  OFFER_WINDOW_DAYS,
  OFFERS_PER_AREA_PER_WINDOW,
} from "../config/matchmaking";
import { paginate, buildPagination } from "../helpers/pagination";
import { computeRelevanceScore } from "../services/matchmaking";
import { dispatchNotification } from "../services/notification";
import { emitToAccount } from "../realtime/emitter";
import { maskAccount } from "../services/anonymity";
import { applyFeeVisibility } from "../services/feeVisibility";

const REQUEST_TTL_DAYS = 7;

// The intake's `matter` is a PracticeArea id. Notifications and the conversation
// header want the human name, so resolve it (best-effort — a missing area just
// drops the label rather than failing the action that triggered it).
export const matterNameOf = async (intakePayload: any): Promise<string | null> => {
  const matterId = intakePayload?.matter;
  if (typeof matterId !== "string" || !matterId) return null;
  const area = await prisma.practiceArea
    .findUnique({ where: { id: matterId }, select: { name: true } })
    .catch(() => null);
  return area?.name ?? null;
};

// First line of what the client actually typed in the "Get a Lawyer" intake.
export const intakeSnippet = (intakePayload: any, max = 140): string | null => {
  const text = typeof intakePayload?.freeText === "string" ? intakePayload.freeText.trim() : "";
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export const _createRequest = async (
  userAccountId: string,
  body: { lawyerAccountId: string; intakePayload: any },
  now: Date = new Date()
): Promise<Response> => {
  if (body.lawyerAccountId === userAccountId) {
    throw badRequest("Cannot send a request to yourself");
  }

  // The practice area drives the cooldown and the quota, so it has to be present
  // and real. It is denormalised onto the row because `intakePayload` is untyped
  // Json and a JSON path can't be indexed.
  const practiceAreaId = body.intakePayload?.matter;
  if (typeof practiceAreaId !== "string" || !practiceAreaId) {
    throw badRequest("Intake is missing the type of legal matter");
  }
  const area = await prisma.practiceArea.findUnique({
    where: { id: practiceAreaId },
    select: { id: true },
  });
  if (!area) throw badRequest("Unknown practice area");

  // Match, don't browse: you can only request someone the system offered you.
  // Without this the whole matching funnel — cooldown, rotation, quota — is
  // side-stepped by finding a lawyer through name search and requesting directly.
  const offer = await findActionableOffer(userAccountId, body.lawyerAccountId, now);
  if (!offer) {
    throw forbidden(
      "You can only send a request to a lawyer you've been matched with. Start from 'Get a Lawyer' to be matched."
    );
  }
  if (offer.practiceAreaId !== practiceAreaId) {
    throw badRequest("This match was for a different type of legal matter");
  }

  const used = await countConsumingRequestsInWindow(
    userAccountId,
    practiceAreaId,
    new Date(now.getTime() - OFFER_WINDOW_MS)
  );
  if (used >= OFFERS_PER_AREA_PER_WINDOW) {
    throw badRequest(
      `You've sent your ${OFFERS_PER_AREA_PER_WINDOW} requests for this type of matter in the last ${OFFER_WINDOW_DAYS} days. Requests that were declined or went unanswered don't count — you can send another once one of your open requests is resolved.`
    );
  }

  const lawyer = await prisma.account.findUnique({
    where: { id: body.lawyerAccountId },
    include: { lawyerProfile: true, firmProfile: true },
  });
  if (!lawyer || lawyer.status !== "active") throw notFound("Lawyer not found");
  if (!["LAWYER", "FIRM"].includes(lawyer.role)) {
    throw badRequest("Recipient must be a lawyer or firm");
  }
  const verif =
    lawyer.lawyerProfile?.verificationStatus ||
    lawyer.firmProfile?.verificationStatus ||
    "verified";
  if (verif !== "verified") throw badRequest("Lawyer is not verified");
  // Client leads are a Professional-membership feature — community accounts cannot
  // receive new requests (mirrors their exclusion from matchmaking).
  if (lawyer.membershipTier !== "professional") {
    throw badRequest("This lawyer is not currently accepting new clients");
  }

  const existingPending = await prisma.request.findFirst({
    where: {
      userAccountId,
      lawyerAccountId: body.lawyerAccountId,
      status: "pending",
    },
  });
  if (existingPending) {
    throw conflict("You already have a pending request with this lawyer");
  }

  const score = await computeRelevanceScore(body.intakePayload, body.lawyerAccountId);
  const expiresAt = new Date(now.getTime() + REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000);
  const request = await createRequest({
    userAccountId,
    lawyerAccountId: body.lawyerAccountId,
    intakePayload: body.intakePayload,
    practiceAreaId,
    relevanceScore: score,
    expiresAt,
  });

  // Spend the offer. Best-effort: a failure here must not undo a request the
  // client has already had confirmed — worst case they keep an unspent offer.
  await attachRequestToOffer(offer.id, request.id).catch((err) =>
    console.error("[request] failed to attach offer:", (err as Error).message)
  );

  await dispatchNotification({
    recipientAccountId: body.lawyerAccountId,
    type: "new_request",
    payload: {
      requestId: request.id,
      actorAccountId: userAccountId,
      matter: body.intakePayload?.matter,
      // `matter` is a PracticeArea id — resolve the name so the notification can
      // say "Tenancy Law" instead of a UUID.
      matterName: await matterNameOf(body.intakePayload),
      snippet: intakeSnippet(body.intakePayload),
    },
  });
  emitToAccount(body.lawyerAccountId, "request:new", { requestId: request.id });

  return response({ error: false, message: "Request created", data: request });
};

export const _listMyRequests = async (
  userAccountId: string,
  viewerId: string,
  filters: { status?: string; page?: number; limit?: number }
): Promise<Response> => {
  const { skip, take, page, limit } = paginate(filters.page, filters.limit);
  const { items, total } = await listRequests(
    userAccountId,
    { status: filters.status },
    skip,
    take
  );
  const decorated = items.map((it) => ({
    ...it,
    lawyerAccount: applyFeeVisibility(
      maskAccount(it.lawyerAccount as any, viewerId),
      viewerId
    ),
  }));
  return response({
    error: false,
    message: "Requests retrieved",
    data: { items: decorated, pagination: buildPagination(total, page, limit) },
  });
};

export const _getRequest = async (id: string, viewerId: string): Promise<Response> => {
  const r = await findRequestById(id);
  if (!r) throw notFound("Request not found");
  if (r.userAccountId !== viewerId && r.lawyerAccountId !== viewerId) {
    throw forbidden("Not your request");
  }
  return response({
    error: false,
    message: "Request retrieved",
    data: {
      ...r,
      userAccount: applyFeeVisibility(
        maskAccount(r.userAccount as any, viewerId),
        viewerId
      ),
      lawyerAccount: applyFeeVisibility(
        maskAccount(r.lawyerAccount as any, viewerId),
        viewerId
      ),
    },
  });
};

export const _cancelRequest = async (id: string, viewerId: string): Promise<Response> => {
  const r = await findRequestById(id);
  if (!r) throw notFound("Request not found");
  if (r.userAccountId !== viewerId) throw forbidden("Not your request");
  if (r.status !== "pending") throw badRequest("Only pending requests can be cancelled");
  await cancelRequest(id);
  // Deliberately does NOT release the match offer. A decline or a lapse is the
  // lawyer's doing and refunds the client's slot; cancelling is the client's own
  // choice, and refunding it would make request-then-cancel a free reroll.
  return response({ error: false, message: "Request cancelled" });
};

export const _listLeads = async (
  lawyerAccountId: string,
  viewerId: string,
  filters: { status?: string; page?: number; limit?: number }
): Promise<Response> => {
  const { skip, take, page, limit } = paginate(filters.page, filters.limit);
  const { items, total } = await listLeads(
    lawyerAccountId,
    { status: filters.status },
    skip,
    take
  );
  const decorated = items.map((it) => ({
    ...it,
    userAccount: maskAccount(it.userAccount as any, viewerId),
  }));
  return response({
    error: false,
    message: "Leads retrieved",
    data: { items: decorated, pagination: buildPagination(total, page, limit) },
  });
};

export const _getLead = async (
  id: string,
  lawyerAccountId: string,
  viewerId: string
): Promise<Response> => {
  const r = await findRequestById(id);
  if (!r) throw notFound("Lead not found");
  if (r.lawyerAccountId !== lawyerAccountId) throw forbidden("Not your lead");
  return response({
    error: false,
    message: "Lead retrieved",
    data: {
      ...r,
      userAccount: maskAccount(r.userAccount as any, viewerId),
    },
  });
};

const sortAccountIds = (a: string, b: string): [string, string] =>
  a < b ? [a, b] : [b, a];

export const _acceptLead = async (
  id: string,
  lawyerAccountId: string
): Promise<Response> => {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.request.findUnique({ where: { id } });
    if (!existing) throw notFound("Lead not found");
    if (existing.lawyerAccountId !== lawyerAccountId) throw forbidden("Not your lead");
    if (existing.status !== "pending") throw conflict("Lead no longer available");

    // Deleting an account expires its pending requests, so this normally can't
    // be reached. It is the backstop for the race (the client deletes between
    // this lawyer opening the lead and tapping accept) and for any rows that
    // predate that behaviour — accepting would otherwise open a conversation
    // with an account that can never read it.
    const client = await tx.account.findUnique({
      where: { id: existing.userAccountId },
      select: { status: true },
    });
    if (!client || client.status !== "active") {
      throw conflict("This client's account is no longer active");
    }

    const conversation = await tx.conversation.create({
      data: {
        userAccountId: existing.userAccountId,
        lawyerAccountId: existing.lawyerAccountId,
        requestId: existing.id,
        status: "active",
      },
    });

    // Seed the thread with what the client actually wrote in the "Get a Lawyer"
    // intake, authored by the client. The lawyer accepted a lead off the back of
    // that complaint, so it is the first thing they should read — and because it
    // is a real Message it also drives the sidebar preview, message history and
    // the unread badge instead of needing special-casing in the UI.
    const complaint = intakeSnippet(existing.intakePayload, 10_000);
    if (complaint) {
      const seeded = await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderAccountId: existing.userAccountId,
          body: complaint,
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: seeded.createdAt,
          lastMessagePreview: complaint.slice(0, 80),
        },
      });
      conversation.lastMessageAt = seeded.createdAt;
      conversation.lastMessagePreview = complaint.slice(0, 80);
    }

    const updated = await tx.request.update({
      where: { id },
      data: {
        status: "accepted",
        respondedAt: new Date(),
        conversationId: conversation.id,
      },
    });

    const [a, b] = sortAccountIds(existing.userAccountId, existing.lawyerAccountId);
    const existingConn = await tx.connection.findUnique({
      where: { accountAId_accountBId: { accountAId: a, accountBId: b } },
    });
    if (!existingConn) {
      await tx.connection.create({
        data: { accountAId: a, accountBId: b, firstConversationId: conversation.id },
      });
      await tx.account.update({
        where: { id: a },
        data: { connectionCount: { increment: 1 } },
      });
      await tx.account.update({
        where: { id: b },
        data: { connectionCount: { increment: 1 } },
      });
    }

    return { request: updated, conversation };
  });

  await dispatchNotification({
    recipientAccountId: result.request.userAccountId,
    type: "request_accepted",
    payload: {
      requestId: result.request.id,
      conversationId: result.conversation.id,
      actorAccountId: result.request.lawyerAccountId,
      matterName: await matterNameOf(result.request.intakePayload),
    },
  });
  emitToAccount(result.request.userAccountId, "request:status_changed", {
    requestId: result.request.id,
    status: "accepted",
    conversationId: result.conversation.id,
  });
  emitToAccount(result.request.lawyerAccountId, "request:status_changed", {
    requestId: result.request.id,
    status: "accepted",
    conversationId: result.conversation.id,
  });

  return response({
    error: false,
    message: "Lead accepted",
    data: result,
  });
};

export const _declineLead = async (
  id: string,
  lawyerAccountId: string,
  reason?: string
): Promise<Response> => {
  const r = await findRequestById(id);
  if (!r) throw notFound("Lead not found");
  if (r.lawyerAccountId !== lawyerAccountId) throw forbidden("Not your lead");
  if (r.status !== "pending") throw conflict("Lead no longer pending");
  const updated = await declineRequest(id, reason);

  // The client was matched with someone who then said no. Release the offer so
  // they can be matched again straight away rather than sitting out the cooldown
  // with nothing to show for it. The declining lawyer stays in the rotation
  // history, so the next draw won't hand them back.
  await releaseBatchIfSettled(id).catch((err) =>
    console.error("[request] failed to release offer on decline:", (err as Error).message)
  );

  await dispatchNotification({
    recipientAccountId: r.userAccountId,
    type: "request_declined",
    payload: {
      requestId: id,
      reason,
      actorAccountId: r.lawyerAccountId,
      matterName: await matterNameOf(r.intakePayload),
    },
  });
  emitToAccount(r.userAccountId, "request:status_changed", {
    requestId: id,
    status: "declined",
  });
  return response({ error: false, message: "Lead declined", data: updated });
};
