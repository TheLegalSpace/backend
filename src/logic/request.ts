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
} from "../dao/request";
import { paginate, buildPagination } from "../helpers/pagination";
import { computeRelevanceScore } from "../services/matchmaking";
import { dispatchNotification } from "../services/notification";
import { emitToAccount } from "../realtime/emitter";
import { maskAccount } from "../services/anonymity";

const REQUEST_TTL_DAYS = 7;

export const _createRequest = async (
  userAccountId: string,
  body: { lawyerAccountId: string; intakePayload: any }
): Promise<Response> => {
  if (body.lawyerAccountId === userAccountId) {
    throw badRequest("Cannot send a request to yourself");
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
  const expiresAt = new Date(Date.now() + REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000);
  const request = await createRequest({
    userAccountId,
    lawyerAccountId: body.lawyerAccountId,
    intakePayload: body.intakePayload,
    relevanceScore: score,
    expiresAt,
  });

  await dispatchNotification({
    recipientAccountId: body.lawyerAccountId,
    type: "new_request",
    payload: { requestId: request.id, matter: body.intakePayload?.matter },
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
    lawyerAccount: maskAccount(it.lawyerAccount as any, viewerId),
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
      userAccount: maskAccount(r.userAccount as any, viewerId),
      lawyerAccount: maskAccount(r.lawyerAccount as any, viewerId),
    },
  });
};

export const _cancelRequest = async (id: string, viewerId: string): Promise<Response> => {
  const r = await findRequestById(id);
  if (!r) throw notFound("Request not found");
  if (r.userAccountId !== viewerId) throw forbidden("Not your request");
  if (r.status !== "pending") throw badRequest("Only pending requests can be cancelled");
  await cancelRequest(id);
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

    const conversation = await tx.conversation.create({
      data: {
        userAccountId: existing.userAccountId,
        lawyerAccountId: existing.lawyerAccountId,
        requestId: existing.id,
        status: "active",
      },
    });

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
  await dispatchNotification({
    recipientAccountId: r.userAccountId,
    type: "request_declined",
    payload: { requestId: id, reason },
  });
  emitToAccount(r.userAccountId, "request:status_changed", {
    requestId: id,
    status: "declined",
  });
  return response({ error: false, message: "Lead declined", data: updated });
};
