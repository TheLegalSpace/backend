import { prisma } from "../config/database";

export const followAccount = async (followerAccountId: string, followedAccountId: string) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.follow.findUnique({
      where: {
        followerAccountId_followedAccountId: { followerAccountId, followedAccountId },
      },
    });
    if (existing) return { follow: existing, created: false };
    const follow = await tx.follow.create({
      data: { followerAccountId, followedAccountId },
    });
    await tx.account.update({
      where: { id: followedAccountId },
      data: { followerCount: { increment: 1 } },
    });
    await tx.account.update({
      where: { id: followerAccountId },
      data: { followingCount: { increment: 1 } },
    });
    return { follow, created: true };
  });
};

export const unfollowAccount = async (followerAccountId: string, followedAccountId: string) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.follow.findUnique({
      where: {
        followerAccountId_followedAccountId: { followerAccountId, followedAccountId },
      },
    });
    if (!existing) return false;
    await tx.follow.delete({ where: { id: existing.id } });
    await tx.account.update({
      where: { id: followedAccountId },
      data: { followerCount: { decrement: 1 } },
    });
    await tx.account.update({
      where: { id: followerAccountId },
      data: { followingCount: { decrement: 1 } },
    });
    return true;
  });
};

export const listFollowing = async (accountId: string, skip: number, take: number) => {
  const [rows, total] = await Promise.all([
    prisma.follow.findMany({
      where: { followerAccountId: accountId },
      include: { followed: { include: { lawyerProfile: true, firmProfile: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.follow.count({ where: { followerAccountId: accountId } }),
  ]);
  return { rows, total };
};

export const listFollowers = async (accountId: string, skip: number, take: number) => {
  const [rows, total] = await Promise.all([
    prisma.follow.findMany({
      where: { followedAccountId: accountId },
      include: { follower: { include: { lawyerProfile: true, firmProfile: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.follow.count({ where: { followedAccountId: accountId } }),
  ]);
  return { rows, total };
};
