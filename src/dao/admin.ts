import { prisma } from "../config/database";

export const listAccounts = async (
  filters: { role?: string; status?: string; verificationStatus?: string; q?: string },
  skip: number,
  take: number
) => {
  const where: any = {};
  const and: any[] = [];
  if (filters.role) where.role = filters.role;
  if (filters.status) where.status = filters.status;
  if (filters.q) {
    and.push({
      OR: [
        { fullName: { contains: filters.q, mode: "insensitive" } },
        { email: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.verificationStatus) {
    and.push({
      OR: [
        { lawyerProfile: { verificationStatus: filters.verificationStatus } },
        { firmProfile: { verificationStatus: filters.verificationStatus } },
      ],
    });
  }
  if (and.length) where.AND = and;
  const [items, total] = await Promise.all([
    prisma.account.findMany({
      where,
      include: { lawyerProfile: true, firmProfile: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.account.count({ where }),
  ]);
  return { items, total };
};

export const setAccountStatus = async (id: string, status: string) => {
  return prisma.account.update({ where: { id }, data: { status } });
};

export const setVerificationStatus = async (
  accountId: string,
  status: string,
  extra: { rejectionReason?: string | null; resetIdentityAttempts?: boolean } = {}
) => {
  const lp = await prisma.lawyerProfile.findUnique({ where: { accountId } });
  if (lp) {
    const flags: any = (lp.verificationFlags as any) || {};
    return prisma.lawyerProfile.update({
      where: { accountId },
      data: {
        verificationStatus: status,
        verificationFlags: {
          ...flags,
          adminApproved: status === "verified",
          // Kept on the profile so the retry screen can say what to fix.
          // Cleared on approval — a stale reason under a verified badge reads
          // as a live problem.
          rejectionReason: status === "rejected" ? extra.rejectionReason ?? null : null,
          rejectedAt: status === "rejected" ? new Date().toISOString() : null,
        },
        // A rejected lawyer is being asked to try again, and the NIN check
        // allows only two paid lookups. Without this reset, an applicant
        // rejected over an identity mismatch is sent back to a step that
        // refuses them before it ever reaches the provider — a dead end inside
        // the path that exists to avoid dead ends.
        ...(extra.resetIdentityAttempts ? { identityCheckAttempts: 0 } : {}),
      },
    });
  }
  return prisma.firmProfile.update({
    where: { accountId },
    data: { verificationStatus: status },
  });
};

export const listKycQueue = async (skip: number, take: number) => {
  const [lawyers, firms, lawyerCount, firmCount] = await Promise.all([
    prisma.lawyerProfile.findMany({
      where: { verificationStatus: "under_review" },
      include: { account: true },
      skip,
      take,
    }),
    prisma.firmProfile.findMany({
      where: { verificationStatus: "under_review" },
      include: { account: true },
      skip,
      take,
    }),
    prisma.lawyerProfile.count({ where: { verificationStatus: "under_review" } }),
    prisma.firmProfile.count({ where: { verificationStatus: "under_review" } }),
  ]);
  return { lawyers, firms, total: lawyerCount + firmCount };
};

export const listVerificationDocuments = async (accountId: string) =>
  prisma.verificationDocument.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
  });

export const recordAuditLog = async (data: {
  adminAccountId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  metadata?: any;
}) => {
  return prisma.adminAuditLog.create({ data });
};

export const listAuditLog = async (
  filters: any,
  skip: number,
  take: number
) => {
  const where: any = {};
  if (filters.adminAccountId) where.adminAccountId = filters.adminAccountId;
  if (filters.action) where.action = filters.action;
  if (filters.targetType) where.targetType = filters.targetType;
  if (filters.dateFrom) where.createdAt = { gte: new Date(filters.dateFrom) };
  if (filters.dateTo)
    where.createdAt = { ...(where.createdAt || {}), lte: new Date(filters.dateTo) };
  const [items, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.adminAuditLog.count({ where }),
  ]);
  return { items, total };
};
