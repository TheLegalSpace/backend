import { prisma } from "../config/database";

// Fire-and-forget search logging. Never throws into the request path — a failed
// analytics insert must not break a search.
export const logSearch = (data: {
  accountId?: string | null;
  query: string;
  kind: "search" | "matchmaking" | "matchmaking_text";
  resultCount?: number | null;
}): void => {
  const query = data.query?.trim();
  if (!query) return;
  prisma.searchLog
    .create({
      data: {
        accountId: data.accountId ?? null,
        query: query.slice(0, 300),
        kind: data.kind,
        resultCount: data.resultCount ?? null,
      },
    })
    .catch((err) => console.error("[analytics] logSearch failed:", err?.message));
};

// Top search queries (case-insensitive) over a recent window.
export const topSearchQueries = async (
  sinceDays: number,
  take: number
): Promise<{ query: string; count: number }[]> => {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const rows = await prisma.$queryRaw<{ query: string; count: bigint }[]>`
    SELECT lower(query) AS query, COUNT(*) AS count
    FROM search_logs
    WHERE created_at >= ${since}
    GROUP BY lower(query)
    ORDER BY count DESC
    LIMIT ${take}
  `;
  return rows.map((r) => ({ query: r.query, count: Number(r.count) }));
};

// ---- Daily active-user snapshots ----

export const upsertDailyStats = async (
  date: Date,
  data: { dau: number; mau: number; newUsers: number }
) =>
  prisma.dailyStats.upsert({
    where: { date },
    create: { date, ...data },
    update: { ...data },
  });

export const countActiveSince = async (since: Date): Promise<number> =>
  prisma.account.count({
    where: { status: { not: "deleted" }, lastActiveAt: { gte: since } },
  });

export const countNewAccountsBetween = async (from: Date, to: Date): Promise<number> =>
  prisma.account.count({ where: { createdAt: { gte: from, lt: to } } });

export const listDailyStats = async (sinceDays: number) => {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  return prisma.dailyStats.findMany({
    where: { date: { gte: since } },
    orderBy: { date: "desc" },
  });
};

export const latestDailyStats = async () =>
  prisma.dailyStats.findFirst({ orderBy: { date: "desc" } });

// ---- Event view approximation (impressions ≈ active users in the window) ----

// Sum of daily active users across the promotion's date window. Only days that
// were snapshotted count — history accrues from the first daily-stats run.
export const sumDauBetween = async (start: Date, end: Date): Promise<number> => {
  const agg = await prisma.dailyStats.aggregate({
    where: { date: { gte: start, lte: end } },
    _sum: { dau: true },
  });
  return agg._sum.dau || 0;
};

// Breakdown of accounts active since `since`, by role — approximate audience mix.
export const activeCountByRole = async (
  since: Date
): Promise<Record<string, number>> => {
  const rows = await prisma.account.groupBy({
    by: ["role"],
    where: { status: { not: "deleted" }, lastActiveAt: { gte: since } },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.role] = r._count._all;
  return out;
};

// Breakdown of active accounts by city — approximate audience geography.
export const activeCountByCity = async (
  since: Date,
  take: number
): Promise<{ city: string; count: number }[]> => {
  const rows = await prisma.$queryRaw<{ city: string | null; count: bigint }[]>`
    SELECT location_city AS city, COUNT(*) AS count
    FROM accounts
    WHERE status <> 'deleted' AND last_active_at >= ${since} AND location_city IS NOT NULL
    GROUP BY location_city
    ORDER BY count DESC
    LIMIT ${take}
  `;
  return rows.map((r) => ({ city: r.city || "Unknown", count: Number(r.count) }));
};
