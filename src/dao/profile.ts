import { prisma } from "../config/database";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export const findServicesByAccount = async (accountId: string) => {
  return prisma.serviceOffering.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
  });
};

export const replaceServicesTx = async (
  tx: Tx,
  accountId: string,
  services: { practiceAreaId: string; name: string; price: number }[]
) => {
  await tx.serviceOffering.deleteMany({ where: { accountId } });
  if (services.length > 0) {
    await tx.serviceOffering.createMany({
      data: services.map((s) => ({
        accountId,
        practiceAreaId: s.practiceAreaId,
        name: s.name,
        price: s.price,
      })),
    });
  }
};

export const deleteServicesForRemovedAreasTx = async (
  tx: Tx,
  accountId: string,
  removedPracticeAreaIds: string[]
) => {
  if (removedPracticeAreaIds.length === 0) return;
  await tx.serviceOffering.deleteMany({
    where: { accountId, practiceAreaId: { in: removedPracticeAreaIds } },
  });
};

export const applyFeeRangeFromServicesTx = async (
  tx: Tx,
  accountId: string,
  role: string
) => {
  const services = await tx.serviceOffering.findMany({
    where: { accountId },
    select: { price: true },
  });
  const feeRangeMin = services.length === 0 ? 0 : Math.min(...services.map((s) => s.price));
  const feeRangeMax = services.length === 0 ? 0 : Math.max(...services.map((s) => s.price));
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
