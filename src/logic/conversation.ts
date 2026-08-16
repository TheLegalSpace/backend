import { prisma } from "../config/database";
import { redis } from "../config/redis";
import {
  response,
  badRequest,
  notFound,
  forbidden,
  gone,
} from "../helpers/utility";

// After 14 days of inactivity a conversation is archived. To the API it then
// reads as "deleted" — archived is our safe-delete (data retained for audit /
// disputes / NDPR, but no longer reachable from the UI). 410 lets the frontend
// distinguish "deleted after inactivity" from a plain 404.
const ARCHIVED_MESSAGE =
  "This conversation was deleted after 14 days of inactivity and is no longer available";
import { Response } from "../interface";
import {
  listConversationsForAccount,
  findConversationById,
  listMessages,
  createMessage,
  markMessageRead,
  closeConversation,
  archiveConversation,
  unreadCountForAccount,
  markConversationRead,
} from "../dao/conversation";
import { findPracticeAreasByIds } from "../dao/practiceArea";
import { paginate, buildPagination } from "../helpers/pagination";
import { maskAccount } from "../services/anonymity";
import { applyFeeVisibility } from "../services/feeVisibility";
import { dispatchNotification } from "../services/notification";
import { emitToConversation, emitToAccount } from "../realtime/emitter";

export const _listConversations = async (
  accountId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { items, total } = await listConversationsForAccount(accountId, skip, take);

  const matterIds = Array.from(
    new Set(
      items
        .map((c) => (c.request?.intakePayload as any)?.matter)
        .filter((m): m is string => typeof m === "string" && m.length > 0)
    )
  );
  const areas = await findPracticeAreasByIds(matterIds);
  const matterNameById = new Map(areas.map((a) => [a.id, a.name]));

  const decorated = await Promise.all(
    items.map(async (conv) => {
      const otherParty =
        conv.userAccountId === accountId ? conv.lawyerAccount : conv.userAccount;
      const unread = await unreadCountForAccount(conv.id, accountId);
      const intake = conv.request?.intakePayload as any;
      const matterId = intake?.matter;
      const freeText = typeof intake?.freeText === "string" ? intake.freeText.trim() : "";
      return {
        id: conv.id,
        status: conv.status,
        lastMessageAt: conv.lastMessageAt,
        lastMessagePreview: conv.lastMessagePreview,
        otherParty: applyFeeVisibility(maskAccount(otherParty as any, accountId), accountId),
        unreadCount: unread,
        matterName: matterId ? matterNameById.get(matterId) ?? null : null,
        intakeSummary: freeText ? freeText.slice(0, 60) : null,
      };
    })
  );
  return response({
    error: false,
    message: "Conversations retrieved",
    data: { items: decorated, pagination: buildPagination(total, p, l) },
  });
};

export const _getConversation = async (
  id: string,
  viewerId: string
): Promise<Response> => {
  const conv = await findConversationById(id);
  if (!conv) throw notFound("Conversation not found");
  if (conv.status === "archived") throw gone(ARCHIVED_MESSAGE);
  const intake = conv.request?.intakePayload as any;
  const matterId = intake?.matter;
  const freeText = typeof intake?.freeText === "string" ? intake.freeText.trim() : "";
  const [area] = matterId ? await findPracticeAreasByIds([matterId]) : [];
  return response({
    error: false,
    message: "Conversation retrieved",
    data: {
      ...conv,
      userAccount: applyFeeVisibility(maskAccount(conv.userAccount as any, viewerId), viewerId),
      lawyerAccount: applyFeeVisibility(maskAccount(conv.lawyerAccount as any, viewerId), viewerId),
      matterName: area?.name ?? null,
      intakeSummary: freeText ? freeText.slice(0, 60) : null,
      // The brief the client filled in before requesting this lawyer — what they
      // said, what area it falls under, their budget and location. The complaint
      // is also seeded as the first message in the thread, but the header card
      // needs it whole and structured (the message is just prose).
      intake: {
        matterId: matterId ?? null,
        matterName: area?.name ?? null,
        budget: intake?.budget ?? null,
        location: intake?.location ?? null,
        preference: intake?.preference ?? null,
        description: freeText || null,
      },
    },
  });
};

export const _listMessages = async (
  conversationId: string,
  before?: string,
  limit = 50
): Promise<Response> => {
  const conv = await findConversationById(conversationId);
  if (!conv) throw notFound("Conversation not found");
  if (conv.status === "archived") throw gone(ARCHIVED_MESSAGE);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const items = await listMessages(conversationId, before, safeLimit);
  return response({
    error: false,
    message: "Messages retrieved",
    data: { items },
  });
};

const NOTIFICATION_DEBOUNCE_KEY = (conversationId: string, recipientId: string) =>
  `notif-debounce:msg:${conversationId}:${recipientId}`;

export const _sendMessage = async (
  conversationId: string,
  senderAccountId: string,
  body: { body: string; attachments?: any }
): Promise<Response> => {
  const conv = await findConversationById(conversationId);
  if (!conv) throw notFound("Conversation not found");
  if (conv.status === "archived") throw gone(ARCHIVED_MESSAGE);
  if (conv.status !== "active") throw badRequest("Conversation is not active");
  if (!body.body || body.body.length === 0) throw badRequest("Body is required");
  if (body.body.length > 10000) throw badRequest("Body exceeds 10000 characters");
  if (
    conv.userAccountId !== senderAccountId &&
    conv.lawyerAccountId !== senderAccountId
  ) {
    throw forbidden("Not a participant");
  }
  const message = await createMessage({
    conversationId,
    senderAccountId,
    body: body.body,
    attachments: body.attachments,
  });

  emitToConversation(conversationId, "message", message);

  const recipientId =
    conv.userAccountId === senderAccountId ? conv.lawyerAccountId : conv.userAccountId;

  const debounceKey = NOTIFICATION_DEBOUNCE_KEY(conversationId, recipientId);
  const set = await redis
    .set(debounceKey, "1", "EX", 60, "NX")
    .catch(() => null);
  if (set === "OK") {
    await dispatchNotification({
      recipientAccountId: recipientId,
      type: "new_message",
      payload: {
        conversationId,
        snippet: body.body.slice(0, 80),
        senderAccountId,
        actorAccountId: senderAccountId,
      },
    });
  }
  return response({ error: false, message: "Message sent", data: message });
};

export const _markRead = async (
  conversationId: string,
  messageId: string,
  accountId: string
): Promise<Response> => {
  const m = await markMessageRead(messageId);
  if (!m) throw notFound("Message not found");
  emitToConversation(conversationId, "message:read", {
    conversationId,
    messageId,
    readAt: m.readAt,
    readByAccountId: accountId,
  });
  return response({ error: false, message: "Marked read", data: m });
};

export const _markConversationRead = async (
  conversationId: string,
  accountId: string
): Promise<Response> => {
  const conv = await findConversationById(conversationId);
  if (!conv) throw notFound("Conversation not found");
  if (conv.status === "archived") throw gone(ARCHIVED_MESSAGE);
  if (
    conv.userAccountId !== accountId &&
    conv.lawyerAccountId !== accountId
  ) {
    throw forbidden("Not a participant");
  }
  const { count, readAt } = await markConversationRead(conversationId, accountId);
  if (count > 0) {
    emitToConversation(conversationId, "message:read", {
      conversationId,
      bulk: true,
      readAt,
      readByAccountId: accountId,
    });
  }
  return response({
    error: false,
    message: "Conversation marked read",
    data: { conversationId, updated: count },
  });
};

export const _closeConversation = async (
  id: string,
  closedByAccountId: string
): Promise<Response> => {
  const conv = await findConversationById(id);
  if (!conv) throw notFound("Conversation not found");
  if (conv.status === "closed") throw badRequest("Already closed");
  const updated = await closeConversation(id, closedByAccountId);
  emitToConversation(id, "conversation:updated", updated);

  // Each side is told who they're reviewing — the other participant.
  await dispatchNotification({
    recipientAccountId: conv.userAccountId,
    type: "review_request",
    payload: { conversationId: id, actorAccountId: conv.lawyerAccountId },
  });
  await dispatchNotification({
    recipientAccountId: conv.lawyerAccountId,
    type: "review_request",
    payload: { conversationId: id, actorAccountId: conv.userAccountId },
  });
  return response({ error: false, message: "Conversation closed", data: updated });
};

export const _archiveConversation = async (
  id: string,
  accountId: string
): Promise<Response> => {
  const conv = await findConversationById(id);
  if (!conv) throw notFound("Conversation not found");
  if (conv.userAccountId !== accountId && conv.lawyerAccountId !== accountId) {
    throw forbidden("Not a participant");
  }
  if (conv.status === "archived") throw badRequest("Already archived");
  const updated = await archiveConversation(id);
  emitToConversation(id, "conversation:updated", updated);
  return response({ error: false, message: "Conversation archived", data: updated });
};
