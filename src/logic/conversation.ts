import { prisma } from "../config/database";
import { redis } from "../config/redis";
import {
  response,
  badRequest,
  notFound,
  forbidden,
} from "../helpers/utility";
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
} from "../dao/conversation";
import { paginate, buildPagination } from "../helpers/pagination";
import { maskAccount } from "../services/anonymity";
import { dispatchNotification } from "../services/notification";
import { emitToConversation, emitToAccount } from "../realtime/emitter";

export const _listConversations = async (
  accountId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { items, total } = await listConversationsForAccount(accountId, skip, take);

  const decorated = await Promise.all(
    items.map(async (conv) => {
      const otherParty =
        conv.userAccountId === accountId ? conv.lawyerAccount : conv.userAccount;
      const unread = await unreadCountForAccount(conv.id, accountId);
      return {
        id: conv.id,
        status: conv.status,
        lastMessageAt: conv.lastMessageAt,
        lastMessagePreview: conv.lastMessagePreview,
        otherParty: maskAccount(otherParty as any, accountId),
        unreadCount: unread,
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
  return response({
    error: false,
    message: "Conversation retrieved",
    data: {
      ...conv,
      userAccount: maskAccount(conv.userAccount as any, viewerId),
      lawyerAccount: maskAccount(conv.lawyerAccount as any, viewerId),
    },
  });
};

export const _listMessages = async (
  conversationId: string,
  before?: string,
  limit = 50
): Promise<Response> => {
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

export const _closeConversation = async (
  id: string,
  closedByAccountId: string
): Promise<Response> => {
  const conv = await findConversationById(id);
  if (!conv) throw notFound("Conversation not found");
  if (conv.status === "closed") throw badRequest("Already closed");
  const updated = await closeConversation(id, closedByAccountId);
  emitToConversation(id, "conversation:updated", updated);

  await dispatchNotification({
    recipientAccountId: conv.userAccountId,
    type: "review_request",
    payload: { conversationId: id },
  });
  await dispatchNotification({
    recipientAccountId: conv.lawyerAccountId,
    type: "review_request",
    payload: { conversationId: id },
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
