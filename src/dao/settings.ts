import { prisma } from "../config/database";

export const getSettings = async (accountId: string) => {
  const existing = await prisma.accountSettings.findUnique({ where: { accountId } });
  if (existing) return existing;
  return prisma.accountSettings.create({ data: { accountId } });
};

export const updateSettings = async (accountId: string, data: any) => {
  const existing = await prisma.accountSettings.findUnique({ where: { accountId } });
  if (!existing) return prisma.accountSettings.create({ data: { accountId, ...data } });
  return prisma.accountSettings.update({ where: { accountId }, data });
};
