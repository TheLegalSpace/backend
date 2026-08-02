import { env } from "../config/env";
import { NotificationType } from "../interface";

/**
 * Renders a stored Notification into the human-readable shape the bell list and
 * Web Push both need: a title, a one-line body, and a deep link.
 *
 * This is the single source of truth for notification copy — the REST list, the
 * Socket.IO payload and the push notification all run through it, so a row that
 * was stored months ago still renders with today's wording. The stored `payload`
 * stays raw data (ids + names); nothing user-facing is frozen into the DB.
 *
 * Payloads are enriched at dispatch time (see `dispatchNotification`), which
 * resolves `actorAccountId` into an anonymity-masked `actorName`. The legacy
 * per-type name keys (`userMaskedName`, `lawyerName`, `senderMaskedName`, …) are
 * still read as fallbacks so notifications created before that existed keep
 * rendering with whatever information they carry.
 */

export interface PresentedNotification {
  title: string;
  body: string;
  /** Frontend-relative path this notification opens. */
  path: string;
  /** Absolute URL (FRONTEND_URL + path) — what the service worker opens on click. */
  url: string;
}

const SOMEONE = "Someone";

export const presentNotification = (notif: {
  type: NotificationType | string;
  payload?: any;
}): PresentedNotification => {
  const p = (notif.payload || {}) as Record<string, any>;
  const actor: string | undefined =
    p.actorName || p.userMaskedName || p.senderMaskedName || p.lawyerName ||
    p.lawyerMaskedName || p.authorName || p.followerName || p.otherPartyName;
  const matter: string | undefined = p.matterName || p.matter;

  let title = "The Legal Space";
  let body = "You have a new notification";
  let path = "/notifications";

  switch (notif.type) {
    case "new_request":
      title = "New client request";
      body = `${actor || "A client"} sent you a request${matter ? ` — ${matter}` : ""}${
        p.snippet ? `: "${p.snippet}"` : ""
      }`;
      path = p.requestId ? `/leads/${p.requestId}` : "/leads";
      break;
    case "request_accepted":
      title = "Request accepted";
      body = `${actor || "Your lawyer"} accepted your request${
        matter ? ` for ${matter}` : ""
      } — you can start chatting now`;
      path = p.conversationId ? `/conversations/${p.conversationId}` : "/requests";
      break;
    case "request_declined":
      title = "Request declined";
      body = `${actor || "The lawyer"} declined your request${
        matter ? ` for ${matter}` : ""
      }${p.reason ? ` — ${p.reason}` : ""}`;
      path = "/requests";
      break;
    case "request_expiring":
      title = "Request expiring soon";
      body = `Your request${actor ? ` with ${actor}` : ""}${
        matter ? ` about ${matter}` : ""
      } expires within 24 hours`;
      path = p.requestId ? `/requests/${p.requestId}` : "/requests";
      break;
    case "request_expired":
      title = "Request expired";
      body = `Your request${actor ? ` to ${actor}` : ""}${
        matter ? ` about ${matter}` : ""
      } expired without a response`;
      path = p.requestId ? `/requests/${p.requestId}` : "/requests";
      break;
    case "new_message":
      title = actor ? `New message from ${actor}` : "New message";
      body = p.snippet || `${actor || SOMEONE} sent you a message`;
      path = p.conversationId ? `/conversations/${p.conversationId}` : "/conversations";
      break;
    case "reply_reminder":
      title = "Unanswered message";
      body = `${actor || SOMEONE} is still waiting for your reply${
        p.snippet ? `: "${p.snippet}"` : ""
      }`;
      path = p.conversationId ? `/conversations/${p.conversationId}` : "/conversations";
      break;
    case "unread_client_message":
      title = "A client is waiting";
      body = `${actor || "A client"} messaged you over 3 hours ago${
        p.snippet ? `: "${p.snippet}"` : ""
      }`;
      path = p.conversationId ? `/conversations/${p.conversationId}` : "/conversations";
      break;
    case "chat_expiring":
      title = "Conversation closing soon";
      body = `Your conversation${
        actor ? ` with ${actor}` : ""
      } will be archived in 2 days unless someone replies`;
      path = p.conversationId ? `/conversations/${p.conversationId}` : "/conversations";
      break;
    case "review_request":
      title = "Leave a review";
      body = `How was your experience with ${actor || "your contact"}?`;
      path = p.conversationId ? `/conversations/${p.conversationId}/review` : "/conversations";
      break;
    case "new_review":
      title = "New review";
      body = `${actor || SOMEONE} left you a ${p.rating ? `${p.rating}-star ` : ""}review${
        p.snippet ? `: "${p.snippet}"` : ""
      }`;
      path = "/profile/me";
      break;
    case "new_follower":
      title = "New follower";
      body = `${actor || SOMEONE} started following you`;
      path = p.actorAccountId || p.followerAccountId
        ? `/profile/${p.actorAccountId || p.followerAccountId}`
        : "/profile/me";
      break;
    case "post_liked":
      title = "Your post was liked";
      body = `${actor || SOMEONE} liked your ${p.postTitle ? `post "${p.postTitle}"` : "post"}`;
      path = p.postId ? `/posts/${p.postId}` : "/feed";
      break;
    case "article_published":
      title = "New article";
      body = `${actor || "Someone you follow"} published ${
        p.postTitle ? `"${p.postTitle}"` : "a new article"
      }`;
      path = p.postId ? `/posts/${p.postId}` : "/feed";
      break;
    case "verification_update":
      title = "Verification update";
      body =
        p.status === "verified"
          ? "Your account has been verified"
          : p.status === "rejected"
          ? `Your verification was rejected${p.reason ? ` — ${p.reason}` : ""}`
          : "Your verification status has changed";
      path = "/profile/me";
      break;
    case "service_request_received":
      title = "Request received";
      body = `We've received your ${
        humanize(p.serviceLabel || p.serviceType) || "service"
      } request — our team will be in touch shortly`;
      path = "/services";
      break;
    case "post_removed":
      title = "Your post was removed";
      body = `${
        p.snippet ? `"${p.snippet}" was` : "One of your posts was"
      } removed after a review${p.reason ? ` — ${p.reason}` : ""}`;
      path = "/profile/me";
      break;
    case "report_reviewed":
      // Sent to the people who flagged the post. Closing the loop is what makes
      // anyone bother reporting a second time.
      title = "Thanks for the report";
      body =
        p.outcome === "removed"
          ? "A post you reported has been removed. Thanks for helping keep The Legal Space professional."
          : "A post you reported has been reviewed.";
      path = "/notifications";
      break;
    case "subscription_activated":
      // planName already reads "Professional Membership (1 year)" — don't append
      // a second "membership" to it.
      title = "Membership active";
      body = `Your ${p.planName || "Professional Membership"} is active${
        p.periodEnd ? ` until ${formatDate(p.periodEnd)}` : ""
      }`;
      path = "/membership";
      break;
    case "subscription_renewed":
      title = "Membership renewed";
      body = `Your ${p.planName || "Professional Membership"} renewed${
        p.periodEnd ? ` — next renewal ${formatDate(p.periodEnd)}` : ""
      }`;
      path = "/membership";
      break;
    case "subscription_expiring_soon":
      title = "Membership expiring soon";
      body = `Your membership expires${
        p.currentPeriodEnd ? ` on ${formatDate(p.currentPeriodEnd)}` : " soon"
      } — renew to keep client leads and TLS Research`;
      path = "/membership";
      break;
    case "subscription_expired":
      title = "Membership expired";
      body = "Your Professional membership has expired — renew to restore your benefits";
      path = "/membership";
      break;
    case "payment_failed":
      title = "Payment failed";
      body = "We couldn't charge your card for your membership renewal. Please update it.";
      path = "/membership";
      break;
    case "credits_purchased":
      title = "Credits added";
      body = `${p.credits ? `${p.credits} research credits` : "Your credits"}${
        p.packName ? ` (${p.packName})` : ""
      } have been added to your account`;
      path = "/credits";
      break;
    case "credits_low":
      title = "Running low on credits";
      body = `${
        typeof p.balance === "number"
          ? `You have ${p.balance} research ${p.balance === 1 ? "credit" : "credits"} left`
          : "Your research credits are running low"
      } — top up to keep using TLS Research`;
      path = "/credits";
      break;
    case "payment_method_updated":
      title = "Payment method";
      body = "Your card update link is ready";
      path = "/membership";
      break;
    case "system":
      title = (p.title as string) || "The Legal Space";
      body =
        (p.message as string) ||
        (p.kind === "event_promotion_approved"
          ? `Your event "${p.title || "promotion"}" is now live on The Legal Space`
          : p.kind === "event_promotion_rejected"
          ? `Your event promotion was not approved${p.reason ? ` — ${p.reason}` : ""}`
          : "You have a new notification");
      if (p.kind === "event_promotion_approved" || p.kind === "event_promotion_rejected") {
        title = "Event promotion";
        path = "/services";
      }
      // Reports against the post were dismissed — it's back in the feed. Only
      // sent when the author had actually been shown an "under review" state.
      if (p.kind === "post_restored") {
        title = "Your post is back";
        body = `${
          p.snippet ? `"${p.snippet}"` : "Your post"
        } was reviewed and is visible again — no action needed`;
        path = p.postId ? `/posts/${p.postId}` : "/profile/me";
      }
      if (p.kind === "support_ticket_received") {
        title = "Support ticket received";
        body = `We've logged ${p.ticketNumber ? `ticket ${p.ticketNumber}` : "your ticket"}${
          p.subject ? ` — "${p.subject}"` : ""
        }. Our team will respond shortly.`;
        path = "/support";
      }
      if (p.kind === "support_ticket_updated") {
        title = "Support ticket updated";
        body = `${p.ticketNumber ? `Ticket ${p.ticketNumber}` : "Your ticket"}${
          p.subject ? ` — "${p.subject}"` : ""
        } is now ${humanize(p.status) || "updated"}`;
        path = "/support";
      }
      break;
    default:
      break;
  }

  const base = env.frontendUrl.replace(/\/$/, "");
  return { title, body, path, url: `${base}${path}` };
};

/**
 * The render-ready notification the clients actually consume — the stored row
 * plus rendered copy, a deep link and a flat actor block.
 *
 * `GET /notifications`, the Socket.IO `notification` event and Web Push all go
 * through this, so a live-delivered notification and a refetched one are the
 * same object.
 */
export const decorateNotification = (n: {
  id?: string;
  type: string;
  payload?: any;
  readAt?: Date | null;
  createdAt?: Date;
  [key: string]: any;
}) => {
  const { title, body, url, path } = presentNotification(n);
  const p = (n.payload || {}) as Record<string, any>;
  return {
    ...n,
    title,
    body,
    url,
    path,
    isRead: n.readAt != null,
    actor: p.actorAccountId
      ? {
          id: p.actorAccountId,
          name: p.actorName ?? null,
          avatarUrl: p.actorAvatarUrl ?? null,
          role: p.actorRole ?? null,
        }
      : null,
  };
};

// "event_promotion" -> "event promotion", "under_review" -> "under review".
const humanize = (value?: string | null): string =>
  typeof value === "string" ? value.replace(/_/g, " ").trim() : "";

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
};
