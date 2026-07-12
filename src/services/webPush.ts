import webpush from "web-push";
import { env } from "../config/env";
import { NotificationType } from "../interface";
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
 * Falls back to a generic message for types not explicitly handled so no
 * notification ever ships without readable text.
 */
export const buildPushPayload = (notif: {
  type: NotificationType | string;
  payload: any;
  id?: string;
}): WebPushPayload => {
  const p = (notif.payload || {}) as Record<string, any>;
  const base = env.frontendUrl.replace(/\/$/, "");
  let title = "The Legal Space";
  let body = "You have a new notification";
  let path = "/notifications";

  switch (notif.type) {
    case "new_request":
      title = "New lead";
      body = `${p.userMaskedName || "A client"} sent you a request${
        p.matter ? ` — ${p.matter}` : ""
      }`;
      path = p.requestId ? `/leads/${p.requestId}` : "/leads";
      break;
    case "request_accepted":
      title = "Request accepted";
      body = `${p.lawyerName || "Your lawyer"} accepted your request`;
      path = p.conversationId
        ? `/conversations/${p.conversationId}`
        : "/requests";
      break;
    case "request_declined":
      title = "Request declined";
      body = `${p.lawyerMaskedName || "The lawyer"} declined your request`;
      path = "/requests";
      break;
    case "request_expiring":
      title = "Request expiring soon";
      body = "A pending request is about to expire";
      path = "/requests";
      break;
    case "request_expired":
      title = "Request expired";
      body = "Your request expired without a response";
      path = "/requests";
      break;
    case "new_message":
    case "reply_reminder":
    case "unread_client_message":
      title = "New message";
      body = `${p.senderMaskedName || "Someone"}: ${
        p.snippet || "sent you a message"
      }`;
      path = p.conversationId
        ? `/conversations/${p.conversationId}`
        : "/conversations";
      break;
    case "chat_expiring":
      title = "Conversation expiring";
      body = "A conversation will be archived soon due to inactivity";
      path = p.conversationId
        ? `/conversations/${p.conversationId}`
        : "/conversations";
      break;
    case "review_request":
      title = "Leave a review";
      body = `How was your experience with ${p.otherPartyName || "your contact"}?`;
      path = p.conversationId
        ? `/conversations/${p.conversationId}`
        : "/conversations";
      break;
    case "new_review":
      title = "New review";
      body = `You received a ${p.rating ? `${p.rating}-star ` : ""}review`;
      path = "/profile/me";
      break;
    case "article_published":
      title = "New article";
      body = `${p.authorName || "Someone you follow"} published a new article`;
      path = p.postId ? `/posts/${p.postId}` : "/feed";
      break;
    case "verification_update":
      title = "Verification update";
      body = "Your verification status has changed";
      path = "/profile/me";
      break;
    case "service_request_received":
      title = "Request received";
      body = "We've received your service request";
      path = "/services";
      break;
    case "subscription_activated":
    case "subscription_renewed":
    case "subscription_expiring_soon":
    case "subscription_expired":
    case "payment_failed":
    case "payment_method_updated":
      title = "Membership update";
      body = (p.message as string) || "There's an update on your membership";
      path = "/membership";
      break;
    case "system":
      title = (p.title as string) || "The Legal Space";
      body = (p.message as string) || "You have a new notification";
      break;
    default:
      break;
  }

  return {
    title,
    body,
    data: {
      url: `${base}${path}`,
      type: notif.type,
      notificationId: notif.id,
    },
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
