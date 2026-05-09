import { prisma } from "../config/database";
import { Prisma } from "@prisma/client";

export const createArticle = async (data: Prisma.ArticleUncheckedCreateInput) => {
  return prisma.article.create({ data });
};

export const findArticleBySlug = async (slug: string) => {
  return prisma.article.findFirst({
    where: { slug, deletedAt: null },
    include: { author: { include: { lawyerProfile: true, firmProfile: true } } },
  });
};

export const findArticleById = async (id: string) => {
  return prisma.article.findFirst({
    where: { id, deletedAt: null },
    include: { author: true },
  });
};

export const updateArticle = async (id: string, data: Prisma.ArticleUpdateInput) => {
  return prisma.article.update({ where: { id }, data });
};

export const softDeleteArticle = async (id: string) => {
  return prisma.article.update({ where: { id }, data: { deletedAt: new Date() } });
};

export const upsertArticleReaction = async (
  articleId: string,
  accountId: string,
  type: "like" | "dislike"
) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.articleReaction.findUnique({
      where: { articleId_accountId: { articleId, accountId } },
    });
    if (existing && existing.type === type) {
      return { reaction: existing, changed: false };
    }
    if (existing && existing.type !== type) {
      const updated = await tx.articleReaction.update({
        where: { id: existing.id },
        data: { type },
      });
      const decField = existing.type === "like" ? "likeCount" : "dislikeCount";
      const incField = type === "like" ? "likeCount" : "dislikeCount";
      await tx.article.update({
        where: { id: articleId },
        data: { [decField]: { decrement: 1 }, [incField]: { increment: 1 } },
      });
      return { reaction: updated, changed: true };
    }
    const created = await tx.articleReaction.create({
      data: { articleId, accountId, type },
    });
    const incField = type === "like" ? "likeCount" : "dislikeCount";
    await tx.article.update({
      where: { id: articleId },
      data: { [incField]: { increment: 1 } },
    });
    return { reaction: created, changed: true };
  });
};

export const removeArticleReaction = async (articleId: string, accountId: string) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.articleReaction.findUnique({
      where: { articleId_accountId: { articleId, accountId } },
    });
    if (!existing) return false;
    await tx.articleReaction.delete({ where: { id: existing.id } });
    const decField = existing.type === "like" ? "likeCount" : "dislikeCount";
    await tx.article.update({
      where: { id: articleId },
      data: { [decField]: { decrement: 1 } },
    });
    return true;
  });
};
