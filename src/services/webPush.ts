import webpush from "web-push";
import { env } from "../config/env";
import { NotificationType } from "../interface";
import { presentNotification } from "./notificationPresenter";
import {
  listPushSubscriptionsByAccount,
  deletePushSubscriptionById,
} from "../dao/pushSubscription";

// VAPID is configured once, lazily, the first time we send — mirrors the
// whatsapp.ts "no-op until configured" pattern so the app boots without keys.
let vapidReady = false;

export const isWebPushConfigured = () =>
  Boolean(env.vapidPublicKey && env.vapidPrivateKey);

const ensureVapid = (): boolean => {
  if (vapidReady) return true;
  if (!isWebPushConfigured()) return false;
  webpush.setVapidDetails(
    env.vapidSubject,
    env.vapidPublicKey,
    env.vapidPrivateKey
  );
  vapidReady = true;
  return true;
};

export interface WebPushPayload {
  title: string;
  body: string;
  // Deep link the service worker opens on click, plus routing metadata.
  data?: Record<string, any>;
}

/**
 * Map a stored Notification to a human push payload (title + body + click URL).
 * The copy itself lives in `notificationPresenter` so the push text and the
 * in-app bell list can never drift apart.
 */
export const buildPushPayload = (notif: {
  type: NotificationType | string;
  payload: any;
  id?: string;
}): WebPushPayload => {
  const { title, body, url } = presentNotification(notif);
  return {
    title,
    body,
    data: { url, type: notif.type, notificationId: notif.id },
  };
};

/**
 * Send a push to every device registered for an account. Best-effort — never
 * throws (the caller's in-app notification must not depend on it). Dead
 * subscriptions (404/410 Gone) are pruned so the table self-heals.
 */
export const sendPushToAccount = async (
  accountId: string,
  payload: WebPushPayload
): Promise<void> => {
  if (!ensureVapid()) {
    console.log(
      `[webpush] not configured — would push to account=${accountId} title="${payload.title}"`
    );
    return;
  }

  const subs = await listPushSubscriptionsByAccount(accountId).catch(() => []);
  if (!subs.length) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          // Subscription is gone (uninstalled / permission revoked) — prune it.
          await deletePushSubscriptionById(sub.id).catch(() => null);
          console.log(`[webpush] pruned dead subscription id=${sub.id}`);
        } else {
          console.error(
            `[webpush] send failed status=${status} endpoint=${sub.endpoint.slice(
              0,
              48
            )}… ${err?.message || ""}`
          );
        }
      }
    })
  );
};
