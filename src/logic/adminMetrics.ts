import { prisma } from "../config/database";
import { response } from "../helpers/utility";
import { Response } from "../interface";
import * as m from "../dao/adminMetrics";
import {
  topSearchQueries,
  listDailyStats,
  countActiveSince,
} from "../dao/analytics";

const startOfDaysAgo = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

const startOfMonth = (offset = 0): Date => {
  const d = new Date();
  d.setMonth(d.getMonth() - offset, 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const monthLabel = (d: Date): string =>
  d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

// ---- Dashboard -------------------------------------------------------------

export const _dashboardMetrics = async (): Promise<Response> => {
  const weekAgo = startOfDaysAgo(7);
  const [
    payments,
    promotions,
    totalUsers,
    activeSubscribers,
    newEnquiriesThisWeek,
    eventsByStatus,
    inquiriesByStatus,
    lawyersUnderReview,
    recentSr,
    recentPay,
  ] = await Promise.all([
    m.sumSuccessfulPayments(),
    m.sumPaidPromotions(),
    m.countActiveAccounts(),
    m.countActiveSubscribers(),
    m.countInquiriesSince(weekAgo),
    m.countEventsByStatus(),
    m.countInquiriesByStatus(),
    m.countLawyersUnderReview(),
    m.recentServiceRequests(5),
    m.recentPayments(5),
  ]);

  const totalRevenueKobo = payments + promotions;
  const docketCount = Object.values(eventsByStatus).reduce((a, b) => a + b, 0);
  const pendingEnquiries =
    (inquiriesByStatus.new || 0) + (inquiriesByStatus.pending || 0);
  const eventsNeedReview = eventsByStatus.pending_review || 0;

  // Merge recent service requests + payments into one time-sorted feed.
  const activities = [
    ...recentSr.map((s) => ({
      kind: "service_request",
      title: s.account?.fullName || s.contactName || "Someone",
      description: `submitted a ${s.type.replace(/_/g, " ")} request`,
      at: s.createdAt,
    })),
    ...recentPay.map((p) => ({
      kind: "payment",
      title: p.account?.fullName || "A member",
      description: `payment of ₦${(p.amountKobo / 100).toLocaleString()} received`,
      at: p.paidAt || p.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);

  return response({
    error: false,
    message: "Dashboard metrics retrieved",
    data: {
      cards: {
        totalRevenueKobo,
        totalUsers,
        activeSubscribers,
        newEnquiriesThisWeek,
        onTheDocket: docketCount,
      },
      pendingTasks: {
        serviceEnquiries: pendingEnquiries,
        lawyerVerifications: lawyersUnderReview,
        eventsNeedReview,
      },
      recentActivities: activities,
    },
  });
};

// ---- Users -----------------------------------------------------------------

export const _usersMetrics = async (): Promise<Response> => {
  const [byRole, suspended, verifiedLawyers] = await Promise.all([
    m.countAccountsByRole(),
    m.countSuspendedAccounts(),
    m.countVerifiedLawyers(),
  ]);
  const total = Object.values(byRole).reduce((a, b) => a + b, 0);
  return response({
    error: false,
    message: "User metrics retrieved",
    data: {
      totalUsers: total,
      lawyers: byRole.LAWYER || 0,
      lawFirms: byRole.FIRM || 0,
      clients: (byRole.USER || 0) + (byRole.PENDING_PROFESSIONAL || 0),
      verifiedLawyers,
      suspendedUsers: suspended,
    },
  });
};

// ---- Subscriptions ---------------------------------------------------------

export const _subscriptionsMetrics = async (): Promise<Response> => {
  const monthAgo = startOfDaysAgo(30);
  const [activeSubscribers, perPlan, churn, revThisMonth, revAllTime, plans] =
    await Promise.all([
      m.countActiveSubscribers(),
      m.subscribersPerPlan(),
      m.churnCounts(monthAgo),
      m.sumSuccessfulPaymentsSince(startOfMonth()),
      m.sumSuccessfulPayments(),
      prisma.plan.findMany({ orderBy: { priceKobo: "asc" } }),
    ]);

  const denom = churn.active + churn.ended;
  const churnRate = denom > 0 ? (churn.ended / denom) * 100 : 0;

  return response({
    error: false,
    message: "Subscription metrics retrieved",
    data: {
      activeSubscribers,
      monthlyRevenueKobo: revThisMonth,
      allTimeRevenueKobo: revAllTime,
      churnRate: Number(churnRate.toFixed(1)),
      churnApproximate: true, // needs a status-change history table for precision
      plans: plans.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        tier: p.tier,
        forRole: p.forRole,
        priceKobo: p.priceKobo,
        intervalMonths: p.intervalMonths,
        features: p.features,
        isActive: p.isActive,
        subscriberCount: perPlan[p.id] || 0,
      })),
    },
  });
};

// ---- Revenue ---------------------------------------------------------------

export const _revenueMetrics = async (months: number): Promise<Response> => {
  const [rows, subsAllTime, docketAllTime, thisMonth, lastMonth] =
    await Promise.all([
      m.monthlyRevenue(months),
      m.sumSuccessfulPayments(),
      m.sumPaidPromotions(),
      m.sumSuccessfulPaymentsSince(startOfMonth()),
      m.sumSuccessfulPaymentsSince(startOfMonth(1)),
    ]);

  // Build breakdown newest-first with month-over-month growth on the total.
  // rows are DESC; compute growth against the next (older) row.
  const breakdown = rows.map((r, i) => {
    const total = r.subscriptionsKobo + r.docketKobo;
    const older = rows[i + 1];
    const olderTotal = older ? older.subscriptionsKobo + older.docketKobo : 0;
    const growth =
      olderTotal > 0 ? ((total - olderTotal) / olderTotal) * 100 : null;
    return {
      month: monthLabel(r.month),
      subscriptionsKobo: r.subscriptionsKobo,
      docketKobo: r.docketKobo,
      totalKobo: total,
      growthPct: growth === null ? null : Number(growth.toFixed(1)),
    };
  });

  const growthThisMonth =
    lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

  return response({
    error: false,
    message: "Revenue metrics retrieved",
    data: {
      totalRevenueKobo: subsAllTime + docketAllTime,
      revenueThisMonthKobo: thisMonth,
      subscriptionRevenueKobo: subsAllTime,
      onTheDocketRevenueKobo: docketAllTime,
      growthThisMonthPct:
        growthThisMonth === null ? null : Number(growthThisMonth.toFixed(1)),
      breakdown,
    },
  });
};

// ---- Analytics (search insights + DAU/MAU) ---------------------------------

export const _searchInsights = async (
  days: number,
  limit: number
): Promise<Response> => {
  const items = await topSearchQueries(days, limit);
  return response({
    error: false,
    message: "Search insights retrieved",
    data: { windowDays: days, topQueries: items },
  });
};

export const _analyticsMetrics = async (days: number): Promise<Response> => {
  const dayAgo = startOfDaysAgo(1);
  const monthAgo = startOfDaysAgo(30);
  // Live current values so the cards aren't empty before the first daily snapshot.
  const [dauNow, mauNow, series] = await Promise.all([
    countActiveSince(dayAgo),
    countActiveSince(monthAgo),
    listDailyStats(days),
  ]);

  // Trend arrow: today's live DAU vs the most recent snapshotted day.
  const prev = series[0]; // listDailyStats is DESC
  const dauTrendPct =
    prev && prev.dau > 0 ? Number((((dauNow - prev.dau) / prev.dau) * 100).toFixed(1)) : null;

  return response({
    error: false,
    message: "Analytics retrieved",
    data: {
      dailyActiveUsers: dauNow,
      monthlyActiveUsers: mauNow,
      dauTrendPct,
      // History accumulates from the first daily snapshot forward (no backfill).
      series: series
        .slice()
        .reverse()
        .map((s) => ({
          date: s.date.toISOString().slice(0, 10),
          dau: s.dau,
          mau: s.mau,
          newUsers: s.newUsers,
        })),
      note: "Page views, session duration, bounce rate and device split require a client-side analytics integration (deferred).",
    },
  });
};
