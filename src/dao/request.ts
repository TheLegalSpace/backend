import { prisma } from "../config/database";

export const createRequest = async (data: {
  userAccountId: string;
  lawyerAccountId: string;
  intakePayload: any;
  practiceAreaId: string;
  relevanceScore: number;
  expiresAt: Date;
}) => {
  return prisma.request.create({ data });
};

/**
 * Requests this user has sent for a practice area inside the quota window.
 *
 * Declined and expired requests are excluded — the client got no engagement out of
 * them, so they should not count against the allowance. Cancelled requests are
 * written as `expired` by `cancelRequest` and are excluded for the same reason
 * (the offer that produced them stays consumed, so this is not a reroll route).
 */
export const countConsumingRequestsInWindow = async (
  userAccountId: string,
  practiceAreaId: string,
  since: Date
): Promise<number> => {
  return prisma.request.count({
    where: {
      userAccountId,
      practiceAreaId,
      createdAt: { gte: since },
      status: { in: ["pending", "accepted", "closed"] },
    },
  });
};

export const findRequestById = async (id: string) => {
  return prisma.request.findUnique({
    where: { id },
    include: {
      userAccount: { include: { lawyerProfile: true, firmProfile: true } },
      lawyerAccount: { include: { lawyerProfile: true, firmProfile: true } },
      conversation: true,
    },
  });
};

export const listRequests = async (
  userAccountId: string,
  filters: { status?: string },
  skip: number,
  take: number
) => {
  const where: any = { userAccountId };
  if (filters.status) where.status = filters.status;
  const [items, total] = await Promise.all([
    prisma.request.findMany({
      where,
      include: { lawyerAccount: { include: { lawyerProfile: true, firmProfile: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.request.count({ where }),
  ]);
  return { items, total };
};

export const listLeads = async (
  lawyerAccountId: string,
  filters: { status?: string },
  skip: number,
  take: number
) => {
  const where: any = { lawyerAccountId };
  if (filters.status) where.status = filters.status;
  const [items, total] = await Promise.all([
    prisma.request.findMany({
      where,
      include: { userAccount: { include: { lawyerProfile: true, firmProfile: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.request.count({ where }),
  ]);
  return { items, total };
};

export const countPendingLeads = async (lawyerAccountId: string) => {
  return prisma.request.count({
    where: { lawyerAccountId, status: "pending" },
  });
};

export const cancelRequest = async (id: string) => {
  return prisma.request.update({
    where: { id },
    data: { status: "expired", respondedAt: new Date() },
  });
};

export const declineRequest = async (id: string, reason?: string) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.request.findUnique({ where: { id } });
    if (!existing) throw new Error("Request not found");
    const intake = (existing.intakePayload as any) || {};
    if (reason) intake.declineReason = reason;
    return tx.request.update({
      where: { id },
      data: { status: "declined", respondedAt: new Date(), intakePayload: intake },
    });
  });
};
