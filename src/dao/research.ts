import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const createThread = async (accountId: string) => {
  return prisma.researchThread.create({
    data: { accountId },
  });
};

export const listThreads = async (accountId: string) => {
  return prisma.researchThread.findMany({
    where: { accountId, deletedAt: null },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });
};

export const findThreadById = async (id: string) => {
  return prisma.researchThread.findFirst({
    where: { id, deletedAt: null },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
};

export const updateThread = async (
  id: string,
  data: { title?: string; pinned?: boolean }
) => {
  return prisma.researchThread.update({ where: { id }, data });
};

export const touchThread = async (id: string) => {
  return prisma.researchThread.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
};

export const softDeleteThread = async (id: string) => {
  return prisma.researchThread.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
};

export const createMessage = async (data: {
  threadId: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Prisma.InputJsonValue | null;
  sources?: Prisma.InputJsonValue | null;
  confident?: boolean | null;
}) => {
  return prisma.researchMessage.create({
    data: {
      threadId: data.threadId,
      role: data.role,
      content: data.content,
      attachments: data.attachments ?? Prisma.JsonNull,
      sources: data.sources ?? Prisma.JsonNull,
      confident: data.confident ?? null,
    },
  });
};

export const listMessagesForThread = async (threadId: string) => {
  return prisma.researchMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });
};

export const countMessagesForThread = async (threadId: string) => {
  return prisma.researchMessage.count({ where: { threadId } });
};
