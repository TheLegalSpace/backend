import { prisma } from "../config/database";
import { redis } from "../config/redis";
import { createNotification } from "../dao/notification";
import { emitToAccount } from "../realtime/emitter";
import { NotificationType } from "../interface";
import { sendWhatsAppTemplate } from "./whatsapp";
import { sendPushToAccount, buildPushPayload } from "./webPush";

// Delivery transports. "in_app" is always sent (it backs the bell badge and is
// the source of truth). Extra channels are best-effort side transports.
export type NotificationChannel = "in_app" | "whatsapp" | "web_push";

// Web Push is default-on for every notification (it backs the closed-app PWA
// experience), except these high-frequency/low-value types which stay in-app
// only to avoid notification fatigue. A caller can still force push for a
// suppressed type by passing channels: ["web_push"].
const PUSH_SUPPRESSED_TYPES = new Set<NotificationType>([
  "new_follower",
  "post_liked",
]);

export interface DispatchNotificationInput {
  recipientAccountId: string;
  type: NotificationType;
  payload: Record<string, any>;
  emailable?: boolean;
  // Extra transports beyond in-app. Defaults to in-app only.
  channels?: NotificationChannel[];
  // Required when channels includes "whatsapp": the approved Meta template + body params.
  whatsapp?: { template: string; params?: string[] };
}

export const dispatchNotification = async (data: DispatchNotificationInput) => {
  console.log(
    `[notification] dispatching type=${data.type} recipient=${data.recipientAccountId}`
  );
  try {
    const notif = await createNotification({
      recipientAccountId: data.recipientAccountId,
      type: data.type,
      payload: data.payload,
    });
    console.log(`[notification] inserted id=${notif.id} type=${data.type}`);
    emitToAccount(data.recipientAccountId, "notification", notif);
    await redis.del(`notif:unread:${data.recipientAccountId}`).catch(() => null);

    // Best-effort Web Push for the closed-app case. Default-on unless the type
    // is suppressed or the caller opts out by passing an explicit channels list
    // that omits "web_push".
    const explicitChannels = data.channels;
    const pushEnabled = explicitChannels
      ? explicitChannels.includes("web_push")
      : !PUSH_SUPPRESSED_TYPES.has(data.type);
    if (pushEnabled) {
      await sendPushToAccount(
        data.recipientAccountId,
        buildPushPayload(notif)
      ).catch((e) =>
        console.error("[notification] web_push channel failed:", e?.message)
      );
    }
  } catch (err: any) {
    console.error("[notification] dispatch failed:", {
      type: data.type,
      recipient: data.recipientAccountId,
      name: err?.name,
      message: err?.message,
      code: err?.code,
      meta: err?.meta,
      stack: err?.stack,
    });
  }

  // Best-effort WhatsApp side channel — must never break the in-app notification.
  if (data.channels?.includes("whatsapp") && data.whatsapp) {
    try {
      const account = await prisma.account.findUnique({
        where: { id: data.recipientAccountId },
        select: { phone: true },
      });
      if (account?.phone) {
        await sendWhatsAppTemplate({
          to: account.phone,
          template: data.whatsapp.template,
          params: data.whatsapp.params,
        });
      } else {
        console.warn(
          `[notification] whatsapp requested but recipient ${data.recipientAccountId} has no phone`
        );
      }
    } catch (err: any) {
      console.error("[notification] whatsapp channel failed:", err?.message);
    }
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
