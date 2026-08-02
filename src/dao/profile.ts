import { prisma } from "../config/database";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

// Roll the per-practice-area fee ranges up into the account-wide
// feeRangeMin/feeRangeMax stored on the profile (coarse budget filter + summary badge).
export const applyFeeRangeRollupTx = async (
  tx: Tx,
  accountId: string,
  role: string
) => {
  const areas = await tx.accountPracticeArea.findMany({
    where: { accountId },
    select: { feeMin: true, feeMax: true },
  });
  // Areas the member left unpriced (0/0) are excluded from the rollup — otherwise
  // one blank area would drag feeRangeMin to 0 and make the matchmaking budget
  // filter match every client regardless of what they can afford.
  const priced = areas.filter((a) => a.feeMin > 0 || a.feeMax > 0);
  const feeRangeMin = priced.length === 0 ? 0 : Math.min(...priced.map((a) => a.feeMin));
  const feeRangeMax = priced.length === 0 ? 0 : Math.max(...priced.map((a) => a.feeMax));
  if (role === "LAWYER") {
    await tx.lawyerProfile.update({
      where: { accountId },
      data: { feeRangeMin, feeRangeMax },
    });
  } else if (role === "FIRM") {
    await tx.firmProfile.update({
      where: { accountId },
      data: { feeRangeMin, feeRangeMax },
    });
  }
  return { feeRangeMin, feeRangeMax };
};

export const updateLawyerProfile = async (
  accountId: string,
  data: {
    callToBarYear?: number;
    nbaBranch?: string;
  }
) => {
  return prisma.lawyerProfile.update({ where: { accountId }, data });
};

export const updateFirmProfile = async (
  accountId: string,
  data: {
    firmName?: string;
    firmEstablishmentYear?: number;
    officeAddress?: string;
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
