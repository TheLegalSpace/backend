import { prisma } from "../config/database";

export const createReview = async (data: {
  reviewerAccountId: string;
  reviewedAccountId: string;
  conversationId: string;
  rating: number;
  body?: string;
}) => {
  return prisma.$transaction(async (tx) => {
    const review = await tx.review.create({ data });
    const stats = await tx.review.aggregate({
      where: { reviewedAccountId: data.reviewedAccountId, deletedAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.account.update({
      where: { id: data.reviewedAccountId },
      data: {
        avgRating: stats._avg.rating || 0,
        reviewCount: stats._count._all,
      },
    });
    return review;
  });
};

export const findReviewById = async (id: string) => {
  return prisma.review.findUnique({
    where: { id },
    include: { reviewer: true, reviewed: true },
  });
};

export const softDeleteReview = async (id: string) => {
  return prisma.$transaction(async (tx) => {
    const r = await tx.review.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    const stats = await tx.review.aggregate({
      where: { reviewedAccountId: r.reviewedAccountId, deletedAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.account.update({
      where: { id: r.reviewedAccountId },
      data: {
        avgRating: stats._avg.rating || 0,
        reviewCount: stats._count._all,
      },
    });
    return r;
  });
};
