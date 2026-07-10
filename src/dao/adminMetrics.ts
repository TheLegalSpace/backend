import { prisma } from "../config/database";

// Pure aggregation queries for the admin dashboard. No business logic here —
// the logic layer composes these into the shapes the admin UI cards expect.

// ---- Revenue ---------------------------------------------------------------

// Sum of successful subscription/one-off payments (kobo).
export const sumSuccessfulPayments = async (): Promise<number> => {
  const agg = await prisma.payment.aggregate({
    where: { status: "success" },
    _sum: { amountKobo: true },
  });
  return agg._sum.amountKobo || 0;
};

// Sum of paid event-promotion service requests (kobo).
export const sumPaidPromotions = async (): Promise<number> => {
  const agg = await prisma.serviceRequest.aggregate({
    where: { type: "event_promotion", paymentStatus: "paid" },
    _sum: { amount: true },
  });
  return agg._sum.amount || 0;
};

export const sumSuccessfulPaymentsSince = async (since: Date): Promise<number> => {
  const agg = await prisma.payment.aggregate({
    where: { status: "success", paidAt: { gte: since } },
    _sum: { amountKobo: true },
  });
  return agg._sum.amountKobo || 0;
};

// Monthly revenue split into subscription vs on-the-docket columns.
// Returns most-recent-first rows of { month, subscriptionsKobo, docketKobo }.
export const monthlyRevenue = async (
  months: number
): Promise<{ month: Date; subscriptionsKobo: number; docketKobo: number }[]> => {
  const rows = await prisma.$queryRaw<
    { month: Date; subscriptions: bigint | null; docket: bigint | null }[]
  >`
    WITH subs AS (
      SELECT date_trunc('month', paid_at) AS month, SUM(amount_kobo) AS total
      FROM payments
      WHERE status = 'success' AND paid_at IS NOT NULL
      GROUP BY 1
    ),
    docket AS (
      SELECT date_trunc('month', created_at) AS month, SUM(amount) AS total
      FROM service_requests
      WHERE type = 'event_promotion' AND payment_status = 'paid' AND amount IS NOT NULL
      GROUP BY 1
    ),
    months AS (
      SELECT month FROM subs
      UNION
      SELECT month FROM docket
    )
    SELECT
      m.month AS month,
      COALESCE(subs.total, 0) AS subscriptions,
      COALESCE(docket.total, 0) AS docket
    FROM months m
    LEFT JOIN subs ON subs.month = m.month
    LEFT JOIN docket ON docket.month = m.month
    ORDER BY m.month DESC
    LIMIT ${months}
  `;
  return rows.map((r) => ({
    month: r.month,
    subscriptionsKobo: Number(r.subscriptions || 0),
    docketKobo: Number(r.docket || 0),
  }));
};

// ---- Users -----------------------------------------------------------------

export const countAccountsByRole = async (): Promise<Record<string, number>> => {
  const rows = await prisma.account.groupBy({
    by: ["role"],
    where: { status: { not: "deleted" } },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.role] = r._count._all;
  return out;
};

export const countActiveAccounts = async (): Promise<number> =>
  prisma.account.count({ where: { status: { not: "deleted" } } });

export const countSuspendedAccounts = async (): Promise<number> =>
  prisma.account.count({ where: { status: "suspended" } });

export const countVerifiedLawyers = async (): Promise<number> =>
  prisma.lawyerProfile.count({ where: { verificationStatus: "verified" } });

export const countLawyersUnderReview = async (): Promise<number> => {
  const [l, f] = await Promise.all([
    prisma.lawyerProfile.count({ where: { verificationStatus: "under_review" } }),
    prisma.firmProfile.count({ where: { verificationStatus: "under_review" } }),
  ]);
  return l + f;
};

// ---- Subscriptions ---------------------------------------------------------

export const countActiveSubscribers = async (): Promise<number> =>
  prisma.subscription.count({ where: { status: "active" } });

export const subscribersPerPlan = async (): Promise<Record<string, number>> => {
  const rows = await prisma.subscription.groupBy({
    by: ["planId"],
    where: { status: "active" },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.planId] = r._count._all;
  return out;
};

// Approximate churn: subscriptions that ended (cancelled/expired) in the window,
// over (still-active + ended). Precise churn needs a status-change history table.
export const churnCounts = async (
  since: Date
): Promise<{ ended: number; active: number }> => {
  const [ended, active] = await Promise.all([
    prisma.subscription.count({
      where: { status: { in: ["cancelled", "expired"] }, updatedAt: { gte: since } },
    }),
    prisma.subscription.count({ where: { status: "active" } }),
  ]);
  return { ended, active };
};

// ---- Docket / enquiries ----------------------------------------------------

export const countEventsByStatus = async (): Promise<Record<string, number>> => {
  const rows = await prisma.event.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r._count._all;
  return out;
};

export const countInquiriesByStatus = async (): Promise<Record<string, number>> => {
  const rows = await prisma.serviceRequest.groupBy({
    by: ["status"],
    where: { type: { not: "event_promotion" } },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r._count._all;
  return out;
};

export const countInquiriesSince = async (since: Date): Promise<number> =>
  prisma.serviceRequest.count({
    where: { type: { not: "event_promotion" }, createdAt: { gte: since } },
  });

// ---- Recent activity feed --------------------------------------------------

export const recentServiceRequests = async (take: number) =>
  prisma.serviceRequest.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { account: { select: { fullName: true, role: true } } },
  });

export const recentPayments = async (take: number) =>
  prisma.payment.findMany({
    where: { status: "success" },
    orderBy: { paidAt: "desc" },
    take,
    include: { account: { select: { fullName: true, role: true } } },
  });
