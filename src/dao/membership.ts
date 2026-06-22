import { prisma } from "../config/database";

// ---- Plans ----

export const getPlanByCode = async (code: string) =>
  prisma.plan.findUnique({ where: { code } });

export const getPlanById = async (id: string) =>
  prisma.plan.findUnique({ where: { id } });

export const getPlanByPaystackCode = async (paystackPlanCode: string) =>
  prisma.plan.findFirst({ where: { paystackPlanCode } });

// Community plan + the professional plan for the given role.
export const getPlansForRole = async (role: string) =>
  prisma.plan.findMany({
    where: {
      isActive: true,
      OR: [{ tier: "community" }, { forRole: role }],
    },
    orderBy: { priceKobo: "asc" },
  });

export const setPlanPaystackCode = async (id: string, paystackPlanCode: string) =>
  prisma.plan.update({ where: { id }, data: { paystackPlanCode } });

// ---- Subscriptions ----

export const getSubscriptionByAccount = async (accountId: string) =>
  prisma.subscription.findUnique({ where: { accountId }, include: { plan: true } });

export const findSubscriptionByPaystackCode = async (subscriptionCode: string) =>
  prisma.subscription.findFirst({
    where: { paystackSubscriptionCode: subscriptionCode },
    include: { plan: true, account: true },
  });

export const upsertSubscription = async (
  accountId: string,
  data: {
    planId: string;
    status?: string;
    autoRenew?: boolean;
    paystackCustomerCode?: string | null;
    paystackSubscriptionCode?: string | null;
    paystackEmailToken?: string | null;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
  }
) =>
  prisma.subscription.upsert({
    where: { accountId },
    create: { accountId, ...data },
    update: { ...data },
    include: { plan: true },
  });

export const updateSubscription = async (id: string, data: Record<string, any>) =>
  prisma.subscription.update({ where: { id }, data, include: { plan: true } });

// ---- Account membership flag (denormalized for cheap gating) ----

export const setAccountMembership = async (
  accountId: string,
  tier: "community" | "professional",
  expiresAt: Date | null
) =>
  prisma.account.update({
    where: { id: accountId },
    data: { membershipTier: tier, membershipExpiresAt: expiresAt },
  });

// ---- Payment methods ----

export const getDefaultPaymentMethod = async (accountId: string) =>
  prisma.paymentMethod.findFirst({
    where: { accountId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

export const upsertPaymentMethod = async (
  accountId: string,
  data: {
    paystackAuthorizationCode: string;
    cardLast4?: string | null;
    cardBrand?: string | null;
    expMonth?: string | null;
    expYear?: string | null;
    bank?: string | null;
  }
) =>
  prisma.paymentMethod.upsert({
    where: {
      accountId_paystackAuthorizationCode: {
        accountId,
        paystackAuthorizationCode: data.paystackAuthorizationCode,
      },
    },
    create: { accountId, isDefault: true, ...data },
    update: { ...data, isDefault: true },
  });

// ---- Payments ----

export const findPaymentByReference = async (reference: string) =>
  prisma.payment.findUnique({ where: { paystackReference: reference } });

export const createPayment = async (data: {
  accountId: string;
  subscriptionId?: string | null;
  paystackReference: string;
  amountKobo: number;
  status?: string;
  channel?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  paidAt?: Date | null;
  gatewayResponse?: any;
}) => prisma.payment.create({ data });

// ---- Invoices ----

export const countInvoicesThisYear = async (year: number) =>
  prisma.invoice.count({
    where: { invoiceNumber: { startsWith: `INV-${year}-` } },
  });

export const createInvoice = async (data: {
  accountId: string;
  subscriptionId?: string | null;
  paymentId?: string | null;
  invoiceNumber: string;
  planName: string;
  amountKobo: number;
  status?: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  pdfUrl?: string | null;
}) => prisma.invoice.create({ data });

export const updateInvoice = async (id: string, data: Record<string, any>) =>
  prisma.invoice.update({ where: { id }, data });

export const listInvoicesByAccount = async (accountId: string, skip: number, take: number) => {
  const where = { accountId };
  const [items, total] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: { issuedAt: "desc" }, skip, take }),
    prisma.invoice.count({ where }),
  ]);
  return { items, total };
};

export const getInvoiceById = async (id: string) =>
  prisma.invoice.findUnique({ where: { id } });

// ---- Subscription sweep (cron) ----

export const findExpiredSubscriptions = async (now: Date) =>
  prisma.subscription.findMany({
    where: {
      status: { in: ["non_renewing", "cancelled", "past_due"] },
      currentPeriodEnd: { lt: now },
    },
    include: { account: true },
  });

export const findSubscriptionsExpiringSoon = async (from: Date, to: Date) =>
  prisma.subscription.findMany({
    where: {
      status: { in: ["active", "non_renewing"] },
      currentPeriodEnd: { gte: from, lte: to },
    },
    include: { account: true },
  });
