import { prisma } from "../config/database";
import { redis } from "../config/redis";
import { response } from "../helpers/utility";
import { Response } from "../interface";
import { paginate, buildPagination } from "../helpers/pagination";
import { maskAccount } from "../services/anonymity";
import { env } from "../config/env";

const TOP_LAWYERS_KEY = "topAccounts:LAWYER";
const TOP_FIRMS_KEY = "topAccounts:FIRM";
const SIDEBAR_CACHE_KEY = "feed:sidebar";

const decoratePost = (p: any, viewerId: string) => ({
  ...p,
  author: maskAccount(p.author, viewerId),
});

export const _getFeedAll = async (
  viewerId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const followed = await prisma.follow.findMany({
    where: { followerAccountId: viewerId },
    select: { followedAccountId: true },
  });
  const followedIds = followed.map((f) => f.followedAccountId);
  followedIds.push(viewerId);

  const where: any = followedIds.length > 1
    ? { authorAccountId: { in: followedIds }, deletedAt: null }
    : { deletedAt: null };

  const [items, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: { author: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.post.count({ where }),
  ]);

  return response({
    error: false,
    message: "Feed retrieved",
    data: {
      items: items.map((it) => decoratePost(it, viewerId)),
      pagination: buildPagination(total, p, l),
    },
  });
};

export const _getFeedTopAccounts = async (
  role: "LAWYER" | "FIRM",
  viewerId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const cacheKey = role === "LAWYER" ? TOP_LAWYERS_KEY : TOP_FIRMS_KEY;
  const cached = await redis.get(cacheKey).catch(() => null);
  let topIds: string[] = [];
  if (cached) {
    try {
      topIds = JSON.parse(cached);
    } catch {}
  }
  if (topIds.length === 0) {
    const accounts = await prisma.account.findMany({
      where: { role, status: "active" },
      orderBy: [{ avgRating: "desc" }, { reviewCount: "desc" }],
      take: 50,
      select: { id: true },
    });
    topIds = accounts.map((a) => a.id);
    await redis
      .set(cacheKey, JSON.stringify(topIds), "EX", 24 * 60 * 60)
      .catch(() => null);
  }
  if (topIds.length === 0) {
    return response({
      error: false,
      message: "Feed retrieved",
      data: { items: [], pagination: buildPagination(0, p, l) },
    });
  }
  const where = { authorAccountId: { in: topIds }, deletedAt: null };
  const [items, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: { author: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.post.count({ where }),
  ]);
  return response({
    error: false,
    message: "Feed retrieved",
    data: {
      items: items.map((it) => decoratePost(it, viewerId)),
      pagination: buildPagination(total, p, l),
    },
  });
};

export const _getFeedArticles = async (
  viewerId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const where = { pdfUrl: { not: null }, deletedAt: null };
  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: { author: { include: { lawyerProfile: true, firmProfile: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.post.count({ where }),
  ]);
  const items = rows.map((p) => ({
    ...p,
    author: maskAccount(p.author as any, viewerId),
  }));
  return response({
    error: false,
    message: "Articles retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

export const _getFeedEvents = async (
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const now = new Date();
  const where = {
    status: "published",
    OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }],
  };
  const [items, total] = await Promise.all([
    prisma.event.findMany({ where, orderBy: { startAt: "asc" }, skip, take }),
    prisma.event.count({ where }),
  ]);
  return response({
    error: false,
    message: "Events retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

export const _getSidebar = async (): Promise<Response> => {
  const cached = await redis.get(SIDEBAR_CACHE_KEY).catch(() => null);
  if (cached) {
    try {
      return response({
        error: false,
        message: "Sidebar retrieved",
        data: JSON.parse(cached),
      });
    } catch {}
  }
  const sidebarNow = new Date();
  const upcomingEvents = await prisma.event.findMany({
    where: {
      status: "published",
      OR: [{ endAt: { gte: sidebarNow } }, { endAt: null, startAt: { gte: sidebarNow } }],
    },
    orderBy: { startAt: "asc" },
    take: 5,
  });
  const data = {
    onTheDocket: { contactEmail: env.eventsInboxEmail },
    upcomingEvents,
  };
  await redis
    .set(SIDEBAR_CACHE_KEY, JSON.stringify(data), "EX", 15 * 60)
    .catch(() => null);
  return response({ error: false, message: "Sidebar retrieved", data });
};
