import { prisma } from "../config/database";
import { Prisma } from "@prisma/client";

export const findAccountByAuthUserId = async (authUserId: string) => {
  return prisma.account.findUnique({
    where: { authUserId },
    include: {
      lawyerProfile: true,
      firmProfile: true,
      practiceAreaLinks: { include: { practiceArea: true } },
    },
  });
};

export const findAccountById = async (id: string) => {
  return prisma.account.findUnique({
    where: { id },
    include: {
      lawyerProfile: true,
      firmProfile: true,
      practiceAreaLinks: { include: { practiceArea: true } },
    },
  });
};

export const findAccountByEmail = async (email: string) => {
  return prisma.account.findUnique({ where: { email } });
};

export const updateAccount = async (id: string, data: Prisma.AccountUpdateInput) => {
  return prisma.account.update({ where: { id }, data });
};

export const softDeleteAccount = async (id: string) => {
  return prisma.account.update({
    where: { id },
    data: {
      status: "deleted",
      deletedAt: new Date(),
      phone: null,
      avatarUrl: null,
      coverUrl: null,
      bio: null,
      email: `deleted-${id}@deleted.local`,
    },
  });
};

export const incrementAccountCounter = (
  id: string,
  field: "connectionCount" | "followerCount" | "followingCount" | "reviewCount",
  delta: number
) => {
  return prisma.account.update({
    where: { id },
    data: { [field]: { increment: delta } },
  });
};
