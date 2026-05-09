import { prisma } from "../config/database";

export const replacePracticeAreas = async (
  accountId: string,
  practiceAreaIds: string[]
) => {
  return prisma.$transaction([
    prisma.accountPracticeArea.deleteMany({ where: { accountId } }),
    prisma.accountPracticeArea.createMany({
      data: practiceAreaIds.map((practiceAreaId) => ({ accountId, practiceAreaId })),
      skipDuplicates: true,
    }),
  ]);
};

export const updateLawyerProfile = async (
  accountId: string,
  data: {
    callToBarYear?: number;
    nbaBranch?: string;
    feeRangeMin?: number;
    feeRangeMax?: number;
  }
) => {
  return prisma.lawyerProfile.update({ where: { accountId }, data });
};

export const updateFirmProfile = async (
  accountId: string,
  data: {
    firmName?: string;
    firmEstablishmentYear?: number;
    feeRangeMin?: number;
    feeRangeMax?: number;
  }
) => {
  if (data.firmName) {
    return prisma.$transaction(async (tx) => {
      const fp = await tx.firmProfile.update({ where: { accountId }, data });
      await tx.account.update({
        where: { id: accountId },
        data: { fullName: data.firmName },
      });
      return fp;
    });
  }
  return prisma.firmProfile.update({ where: { accountId }, data });
};

export const findConnectionsForAccount = async (accountId: string, skip: number, take: number) => {
  const rows = await prisma.connection.findMany({
    where: { OR: [{ accountAId: accountId }, { accountBId: accountId }] },
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
  const otherIds = rows.map((r) => (r.accountAId === accountId ? r.accountBId : r.accountAId));
  if (otherIds.length === 0) return { rows: [], accounts: [] };
  const accounts = await prisma.account.findMany({
    where: { id: { in: otherIds } },
    include: { lawyerProfile: true, firmProfile: true },
  });
  return { rows, accounts };
};

export const countConnectionsForAccount = async (accountId: string) => {
  return prisma.connection.count({
    where: { OR: [{ accountAId: accountId }, { accountBId: accountId }] },
  });
};

export const isFollowing = async (followerAccountId: string, followedAccountId: string) => {
  const f = await prisma.follow.findUnique({
    where: {
      followerAccountId_followedAccountId: { followerAccountId, followedAccountId },
    },
  });
  return !!f;
};
