import { prisma } from "../config/database";

export const createServiceRequest = async (data: any) =>
  prisma.serviceRequest.create({ data });

export const findServiceRequestById = async (id: string) =>
  prisma.serviceRequest.findUnique({ where: { id }, include: { event: true } });

export const listServiceRequestsByAccount = async (
  accountId: string,
  skip: number,
  take: number
) => {
  const where = { accountId };
  const [items, total] = await Promise.all([
    prisma.serviceRequest.findMany({
      where,
      include: { event: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.serviceRequest.count({ where }),
  ]);
  return { items, total };
};

export const listServiceRequests = async (
  filters: { type?: string; status?: string },
  skip: number,
  take: number
) => {
  const where: any = {};
  if (filters.type) where.type = filters.type;
  if (filters.status) where.status = filters.status;
  const [items, total] = await Promise.all([
    prisma.serviceRequest.findMany({
      where,
      include: { event: true, account: { select: { id: true, fullName: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.serviceRequest.count({ where }),
  ]);
  return { items, total };
};

export const updateServiceRequestStatus = async (id: string, status: string) =>
  prisma.serviceRequest.update({ where: { id }, data: { status } });

export const updateServiceRequest = async (id: string, data: Record<string, any>) =>
  prisma.serviceRequest.update({ where: { id }, data, include: { event: true } });

// ---- Event promotions (admin "On The Docket") ----

// Lists event-promotion service requests, optionally filtered by the linked
// Event's approval status (pending_payment | pending_review | published | rejected).
export const listPromotions = async (
  filters: { eventStatus?: string; paymentStatus?: string },
  skip: number,
  take: number
) => {
  const where: any = { type: "event_promotion" };
  if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;
  if (filters.eventStatus) where.event = { status: filters.eventStatus };
  const [items, total] = await Promise.all([
    prisma.serviceRequest.findMany({
      where,
      include: {
        event: true,
        account: { select: { id: true, fullName: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.serviceRequest.count({ where }),
  ]);
  return { items, total };
};

export const promotionStats = async () => {
  const [byEventStatus, revenue] = await Promise.all([
    prisma.event.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.serviceRequest.aggregate({
      where: { type: "event_promotion", paymentStatus: "paid" },
      _sum: { amount: true },
    }),
  ]);
  const statusCounts: Record<string, number> = {};
  for (const r of byEventStatus) statusCounts[r.status] = r._count._all;
  return { statusCounts, revenueKobo: revenue._sum.amount || 0 };
};
