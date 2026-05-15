import { prisma } from "../config/database";
import { redis } from "../config/redis";
import { createNotification } from "../dao/notification";
import { emitToAccount } from "../realtime/emitter";
import { NotificationType } from "../interface";

export interface DispatchNotificationInput {
  recipientAccountId: string;
  type: NotificationType;
  payload: Record<string, any>;
  emailable?: boolean;
}

export const dispatchNotification = async (data: DispatchNotificationInput) => {
  try {
    const notif = await createNotification({
      recipientAccountId: data.recipientAccountId,
      type: data.type,
      payload: data.payload,
    });
    emitToAccount(data.recipientAccountId, "notification", notif);
    await redis.del(`notif:unread:${data.recipientAccountId}`).catch(() => null);
  } catch (err) {
    console.error("[notification] dispatch failed:", (err as Error).message);
  }
};

export const runDailyDigest = async () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recipients = await prisma.notification.groupBy({
    by: ["recipientAccountId"],
    where: { readAt: null, emailedAt: null, createdAt: { lt: cutoff } },
    _count: { _all: true },
  });
  for (const r of recipients) {
    const items = await prisma.notification.findMany({
      where: {
        recipientAccountId: r.recipientAccountId,
        readAt: null,
        emailedAt: null,
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    console.log(
      `[digest] would email ${r.recipientAccountId} with ${items.length} items`
    );
    await prisma.notification.updateMany({
      where: { id: { in: items.map((i) => i.id) } },
      data: { emailedAt: new Date() },
    });
  }
  return recipients.length;
};
