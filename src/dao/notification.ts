import { prisma } from "../config/database";

export const listNotifications = async (
  recipientAccountId: string,
  skip: number,
  take: number
) => {
  const where = { recipientAccountId };
  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.notification.count({ where }),
  ]);
  return { items, total };
};

export const unreadCount = async (recipientAccountId: string) => {
  return prisma.notification.count({
    where: { recipientAccountId, readAt: null },
  });
};

export const markRead = async (id: string, accountId: string) => {
  return prisma.notification.updateMany({
    where: { id, recipientAccountId: accountId, readAt: null },
    data: { readAt: new Date() },
  });
};

export const markAllRead = async (accountId: string) => {
  return prisma.notification.updateMany({
    where: { recipientAccountId: accountId, readAt: null },
    data: { readAt: new Date() },
  });
};

export const createNotification = async (data: {
  recipientAccountId: string;
  type: string;
  payload: any;
}) => {
  return prisma.notification.create({ data });
};
