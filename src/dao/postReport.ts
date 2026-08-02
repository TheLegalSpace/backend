import { prisma } from "../config/database";
import { AUTO_HIDE_REPORT_THRESHOLD } from "../config/moderation";

const reporterSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  isAnonymous: true,
  avatarUrl: true,
};

export const findReportByPostAndReporter = async (
  postId: string,
  reporterAccountId: string
) =>
  prisma.postReport.findUnique({
    where: { postId_reporterAccountId: { postId, reporterAccountId } },
  });

/**
 * Insert the report, bump the post's open-report counter, and stamp
 * `autoHiddenAt` the moment the counter crosses the threshold — all in one
 * transaction so the counter can never drift from the rows behind it.
 */
export const createReport = async (data: {
  postId: string;
  reporterAccountId: string;
  reason: string;
  details?: string | null;
}) =>
  prisma.$transaction(async (tx) => {
    const report = await tx.postReport.create({ data });
    const post = await tx.post.update({
      where: { id: data.postId },
      data: { reportCount: { increment: 1 } },
      select: { id: true, reportCount: true, autoHiddenAt: true, authorAccountId: true },
    });
    let autoHidden = false;
    if (!post.autoHiddenAt && post.reportCount >= AUTO_HIDE_REPORT_THRESHOLD) {
      await tx.post.update({
        where: { id: data.postId },
        data: { autoHiddenAt: new Date() },
      });
      autoHidden = true;
    }
    return { report, post, autoHidden };
  });

/**
 * Posts with at least one pending report, newest report first. Grouped by post
 * rather than by report — an admin triages content, not individual complaints.
 */
export const listReportedPosts = async (
  filters: { status?: string; reason?: string; autoHiddenOnly?: boolean },
  skip: number,
  take: number
) => {
  const status = filters.status || "pending";
  const reportWhere: any = { status };
  if (filters.reason) reportWhere.reason = filters.reason;

  const where: any = { reports: { some: reportWhere } };
  if (filters.autoHiddenOnly) where.autoHiddenAt = { not: null };

  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: {
        author: {
          select: { ...reporterSelect, status: true, avgRating: true },
        },
        reports: {
          where: reportWhere,
          orderBy: { createdAt: "desc" },
          include: { reporter: { select: reporterSelect } },
        },
      },
      // Most-reported first — the loudest signal deserves the admin's attention
      // before the merely-oldest complaint does.
      orderBy: [{ reportCount: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.post.count({ where }),
  ]);
  return { items: rows, total };
};

export const findReportedPost = async (postId: string) =>
  prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: {
        select: { ...reporterSelect, status: true, avgRating: true, createdAt: true },
      },
      reports: {
        orderBy: { createdAt: "desc" },
        include: {
          reporter: { select: reporterSelect },
          reviewedByAdmin: { select: { id: true, fullName: true } },
        },
      },
    },
  });

export const findPendingReports = async (postId: string) =>
  prisma.postReport.findMany({
    where: { postId, status: "pending" },
    select: { id: true, reporterAccountId: true, reason: true },
  });

/**
 * Resolve every pending report on a post in one shot.
 * - "actioned": the post is soft-deleted and the reports stand.
 * - "dismissed": the reports are cleared, the counter reset and any auto-hide
 *   lifted, putting the post back in circulation.
 */
export const resolveReports = async (
  postId: string,
  outcome: "actioned" | "dismissed",
  adminId: string,
  note?: string
) =>
  prisma.$transaction(async (tx) => {
    const resolved = await tx.postReport.updateMany({
      where: { postId, status: "pending" },
      data: {
        status: outcome,
        reviewedByAdminId: adminId,
        reviewedAt: new Date(),
        resolutionNote: note ?? null,
      },
    });
    const post = await tx.post.update({
      where: { id: postId },
      data:
        outcome === "actioned"
          ? { deletedAt: new Date() }
          : { reportCount: 0, autoHiddenAt: null },
    });
    return { post, resolvedCount: resolved.count };
  });

/**
 * A post that's gone needs no triage. When it's deleted through any other path
 * (author delete, admin force-delete) close out its open reports as `actioned`
 * so the queue and the stats stay honest.
 */
export const closeReportsForDeletedPost = async (postId: string, adminId?: string) =>
  prisma.postReport.updateMany({
    where: { postId, status: "pending" },
    data: {
      status: "actioned",
      reviewedByAdminId: adminId ?? null,
      reviewedAt: new Date(),
      resolutionNote: adminId ? "Post deleted by admin" : "Post deleted by its author",
    },
  });

export const countReportsByStatus = async (): Promise<Record<string, number>> => {
  const rows = await prisma.postReport.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r._count._all;
  return out;
};

export const countPostsWithPendingReports = async () =>
  prisma.post.count({ where: { reports: { some: { status: "pending" } } } });

export const countAutoHiddenPosts = async () =>
  prisma.post.count({ where: { autoHiddenAt: { not: null }, deletedAt: null } });

/** How many of an author's posts have previously been removed on report — repeat-offender signal for the admin. */
export const countPriorRemovalsForAuthor = async (authorAccountId: string) =>
  prisma.postReport.count({
    where: { status: "actioned", post: { authorAccountId } },
  });
