import { redis } from "../config/redis";
import { response } from "../helpers/utility";
import { Response } from "../interface";
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} from "../dao/notification";
import {
  upsertPushSubscription,
  deletePushSubscriptionByEndpoint,
} from "../dao/pushSubscription";
import { paginate, buildPagination } from "../helpers/pagination";
import { presentNotification } from "../services/notificationPresenter";

const UNREAD_CACHE_KEY = (id: string) => `notif:unread:${id}`;
const UNREAD_TTL = 2 * 60;

/**
 * The stored row is raw data (type + ids + names). The bell list needs something
 * it can render directly, so every item is decorated with the same `title` /
 * `body` / `url` the push notification uses, plus a flat `actor` block for the
 * avatar+name row in the design. Rendering at read time (rather than freezing
 * copy into the payload) means older rows pick up wording fixes too.
 */
const decorate = (n: {
  id: string;
  type: string;
  payload: any;
  readAt: Date | null;
  createdAt: Date;
}) => {
  const { title, body, url, path } = presentNotification(n);
  const p = (n.payload || {}) as Record<string, any>;
  return {
    ...n,
    title,
    body,
    url,
    path,
    isRead: n.readAt !== null,
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

export const _list = async (
  accountId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { items, total } = await listNotifications(accountId, skip, take);
  return response({
    error: false,
    message: "Notifications retrieved",
    data: { items: items.map(decorate), pagination: buildPagination(total, p, l) },
  });
};

export const _unreadCount = async (accountId: string): Promise<Response> => {
  const key = UNREAD_CACHE_KEY(accountId);
  const cached = await redis.get(key).catch(() => null);
  if (cached) {
    const num = parseInt(cached, 10);
    if (!Number.isNaN(num)) {
      return response({
        error: false,
        message: "Unread count retrieved",
        data: { count: num },
      });
    }
  }
  const count = await unreadCount(accountId);
  await redis.set(key, String(count), "EX", UNREAD_TTL).catch(() => null);
  return response({
    error: false,
    message: "Unread count retrieved",
    data: { count },
  });
};

export const _markRead = async (
  id: string,
  accountId: string
): Promise<Response> => {
  await markRead(id, accountId);
  await redis.del(UNREAD_CACHE_KEY(accountId)).catch(() => null);
  return response({ error: false, message: "Marked as read" });
};

export const _markAllRead = async (accountId: string): Promise<Response> => {
  await markAllRead(accountId);
  await redis.del(UNREAD_CACHE_KEY(accountId)).catch(() => null);
  return response({ error: false, message: "All marked as read" });
};

export const _subscribePush = async (
  accountId: string,
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  },
  deviceType?: string,
  userAgent?: string
): Promise<Response> => {
  await upsertPushSubscription({
    accountId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    deviceType: deviceType ?? null,
    userAgent: userAgent ?? null,
  });
  return response({ error: false, message: "Push subscription saved" });
};

export const _unsubscribePush = async (
  accountId: string,
  endpoint: string
): Promise<Response> => {
  await deletePushSubscriptionByEndpoint(accountId, endpoint);
  return response({ error: false, message: "Push subscription removed" });
};
