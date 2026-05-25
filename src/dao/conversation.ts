import { prisma } from "../config/database";

export const listConversationsForAccount = async (
  accountId: string,
  skip: number,
  take: number
) => {
  const where = {
    OR: [{ userAccountId: accountId }, { lawyerAccountId: accountId }],
    status: { not: "archived" },
  };
  const [items, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        userAccount: { include: { lawyerProfile: true, firmProfile: true } },
        lawyerAccount: { include: { lawyerProfile: true, firmProfile: true } },
        request: true,
      },
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      skip,
      take,
    }),
    prisma.conversation.count({ where }),
  ]);
  return { items, total };
};

export const findConversationById = async (id: string) => {
  return prisma.conversation.findUnique({
    where: { id },
    include: {
      userAccount: { include: { lawyerProfile: true, firmProfile: true } },
      lawyerAccount: { include: { lawyerProfile: true, firmProfile: true } },
      request: true,
    },
  });
};

export const listMessages = async (
  conversationId: string,
  before: string | undefined,
  limit: number
) => {
  if (before) {
    const cursor = await prisma.message.findUnique({ where: { id: before } });
    if (!cursor) return [];
    return prisma.message.findMany({
      where: { conversationId, createdAt: { lt: cursor.createdAt } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
};

export const createMessage = async (data: {
  conversationId: string;
  senderAccountId: string;
  body: string;
  attachments?: any;
}) => {
  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({ data });
    await tx.conversation.update({
      where: { id: data.conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: data.body.slice(0, 80),
      },
    });
    return message;
  });
};

export const markMessageRead = async (messageId: string) => {
  const m = await prisma.message.findUnique({ where: { id: messageId } });
  if (!m) return null;
  if (m.readAt) return m;
  return prisma.message.update({ where: { id: messageId }, data: { readAt: new Date() } });
};

export const closeConversation = async (id: string, closedByAccountId: string) => {
  return prisma.conversation.update({
    where: { id },
    data: {
      status: "closed",
      closedAt: new Date(),
      closedByAccountId,
    },
  });
};

export const archiveConversation = async (id: string) => {
  return prisma.conversation.update({
    where: { id },
    data: { status: "archived" },
  });
};

export const unreadCountForAccount = async (
  conversationId: string,
  accountId: string
) => {
  return prisma.message.count({
    where: {
      conversationId,
      senderAccountId: { not: accountId },
      readAt: null,
    },
  });
};
