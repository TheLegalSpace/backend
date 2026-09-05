import { prisma } from "../config/database";

export const findDeletionRecordByAccountId = async (accountId: string) => {
  return prisma.accountDeletionRecord.findUnique({ where: { accountId } });
};

export const findDeletionRecordsByEmail = async (email: string) => {
  return prisma.accountDeletionRecord.findMany({
    where: { email },
    orderBy: { deletedAt: "desc" },
  });
};
