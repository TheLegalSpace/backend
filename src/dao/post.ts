import { prisma } from "../config/database";

/**
 * The three rules that decide whether a viewer sees a post, as a reusable
 * Prisma `where` fragment. Spread it into any post query that renders to a
 * human (feed, profile listings, single post):
 *
 *  1. not soft-deleted;
 *  2. not auto-hidden — unless you're the author, who keeps seeing their own
 *     post (with `moderationStatus: "under_review"`) rather than watching it
 *     vanish with no explanation;
 *  3. not something you personally reported — reporting a post means you asked
 *     not to see it, so it leaves your feed immediately.
 *
 * Admin queries deliberately do NOT use this — moderators need the full set.
 */
export const visiblePostWhere = (viewerId: string) => ({
  deletedAt: null,
  OR: [{ autoHiddenAt: null }, { authorAccountId: viewerId }],
  reports: { none: { reporterAccountId: viewerId } },
});

/** Author-facing moderation state for a post the viewer owns. Null for everyone else. */
export const moderationStatusFor = (
  post: { authorAccountId: string; autoHiddenAt: Date | null },
  viewerId: string
): "under_review" | null =>
  post.autoHiddenAt && post.authorAccountId === viewerId ? "under_review" : null;

export const createPost = async (data: {
  authorAccountId: string;
  title?: string | null;
  body: string;
  pdfUrl?: string | null;
  pdfName?: string | null;
  pdfSizeBytes?: number | null;
}) => {
  return prisma.post.create({
    data,
    include: { author: true },
  });
};

/** Raw lookup — any non-deleted post, regardless of moderation state. Use for owner/admin/report paths. */
export const findPostById = async (id: string) => {
  return prisma.post.findFirst({
    where: { id, deletedAt: null },
    include: { author: true },
  });
};

/** Reader-facing lookup — applies the same visibility rules as the feed. */
export const findVisiblePostById = async (id: string, viewerId: string) => {
  return prisma.post.findFirst({
    where: { id, ...visiblePostWhere(viewerId) },
    include: { author: true },
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
