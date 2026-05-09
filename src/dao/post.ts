import { prisma } from "../config/database";

export const createPost = async (data: {
  authorAccountId: string;
  body: string;
  attachedArticleId?: string | null;
}) => {
  return prisma.post.create({
    data,
    include: { author: true, attachedArticle: true },
  });
};

export const findPostById = async (id: string) => {
  return prisma.post.findFirst({
    where: { id, deletedAt: null },
    include: { author: true, attachedArticle: true },
  });
};

export const softDeletePost = async (id: string) => {
  return prisma.post.update({ where: { id }, data: { deletedAt: new Date() } });
};

export const upsertReaction = async (
  postId: string,
  accountId: string,
  type: "like" | "dislike"
) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.postReaction.findUnique({
      where: { postId_accountId: { postId, accountId } },
    });
    if (existing && existing.type === type) {
      return { reaction: existing, changed: false };
    }
    if (existing && existing.type !== type) {
      const updated = await tx.postReaction.update({
        where: { id: existing.id },
        data: { type },
      });
      const decField = existing.type === "like" ? "likeCount" : "dislikeCount";
      const incField = type === "like" ? "likeCount" : "dislikeCount";
      await tx.post.update({
        where: { id: postId },
        data: { [decField]: { decrement: 1 }, [incField]: { increment: 1 } },
      });
      return { reaction: updated, changed: true };
    }
    const created = await tx.postReaction.create({
      data: { postId, accountId, type },
    });
    const incField = type === "like" ? "likeCount" : "dislikeCount";
    await tx.post.update({
      where: { id: postId },
      data: { [incField]: { increment: 1 } },
    });
    return { reaction: created, changed: true };
  });
};

export const removeReaction = async (postId: string, accountId: string) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.postReaction.findUnique({
      where: { postId_accountId: { postId, accountId } },
    });
    if (!existing) return false;
    await tx.postReaction.delete({ where: { id: existing.id } });
    const decField = existing.type === "like" ? "likeCount" : "dislikeCount";
    await tx.post.update({
      where: { id: postId },
      data: { [decField]: { decrement: 1 } },
    });
    return true;
  });
};
