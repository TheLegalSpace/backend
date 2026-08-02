import { response, badRequest, notFound } from "../helpers/utility";
import { Response } from "../interface";
import { ModerationAction } from "../interface/moderation";
import { paginate, buildPagination } from "../helpers/pagination";
import { dispatchNotification } from "../services/notification";
import { recordAuditLog } from "../dao/admin";
import { findPostById } from "../dao/post";
import {
  createReport,
  findReportByPostAndReporter,
  listReportedPosts,
  findReportedPost,
  findPendingReports,
  resolveReports,
  countReportsByStatus,
  countPostsWithPendingReports,
  countAutoHiddenPosts,
  countPriorRemovalsForAuthor,
} from "../dao/postReport";
import {
  REPORT_REASONS,
  REPORT_DETAILS_MAX,
  AUTO_HIDE_REPORT_THRESHOLD,
  isValidReportReason,
  reportReasonRequiresDetails,
  reportReasonLabel,
} from "../config/moderation";

/**
 * The taxonomy the report sheet renders. Served from the backend so the labels
 * the user reads are the same strings the API validates against.
 */
export const _getReportReasons = async (): Promise<Response> =>
  response({
    error: false,
    message: "Report reasons retrieved",
    data: { items: REPORT_REASONS },
  });

export const _reportPost = async (
  reporterAccountId: string,
  postId: string,
  input: { reason: string; details?: string }
): Promise<Response> => {
  const reason = (input.reason || "").trim();
  if (!isValidReportReason(reason)) throw badRequest("Invalid report reason");

  const details = input.details?.trim() || null;
  if (details && details.length > REPORT_DETAILS_MAX) {
    throw badRequest(`Details exceed ${REPORT_DETAILS_MAX} characters`);
  }
  if (reportReasonRequiresDetails(reason) && !details) {
    throw badRequest("Please tell us what's wrong with this post");
  }

  const post = await findPostById(postId);
  if (!post) throw notFound("Post not found");
  if (post.authorAccountId === reporterAccountId) {
    throw badRequest("You can't report your own post. Delete it instead.");
  }

  // Reporting is idempotent: a second report from the same account is not an
  // error the user should see. Return their existing report so the client can
  // keep showing "Reported" rather than an alarming failure state.
  const existing = await findReportByPostAndReporter(postId, reporterAccountId);
  if (existing) {
    return response({
      error: false,
      message: "You've already reported this post. Our team is reviewing it.",
      data: { report: existing, alreadyReported: true, postHidden: true },
    });
  }

  const { report, autoHidden } = await createReport({
    postId,
    reporterAccountId,
    reason,
    details,
  });

  // Deliberately no notification to the author. Telling someone they were
  // reported invites retaliation and leaks the reporter — the author only
  // hears from us if an admin actually removes the post.
  return response({
    error: false,
    message: "Thanks for letting us know. We'll review this post.",
    data: {
      report,
      alreadyReported: false,
      // The post leaves the reporter's feed immediately, whether or not the
      // report crossed the auto-hide threshold for everyone else.
      postHidden: true,
      autoHidden,
      autoHideThreshold: AUTO_HIDE_REPORT_THRESHOLD,
    },
  });
};

// ---- Admin ----

const POST_SNIPPET_CHARS = 140;

const postSnippet = (post: { title?: string | null; body: string }) =>
  post.title?.trim() || post.body.slice(0, POST_SNIPPET_CHARS);

/** Reason tallies + the dominant reason, so the queue row reads at a glance. */
const summarizeReasons = (reports: { reason: string }[]) => {
  const counts: Record<string, number> = {};
  for (const r of reports) counts[r.reason] = (counts[r.reason] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return {
    reasons: counts,
    topReason: top ? top[0] : null,
    topReasonLabel: top ? reportReasonLabel(top[0]) : null,
  };
};

/**
 * The moderation queue, grouped by post rather than by report — an admin
 * triages a piece of content once, not the same content four times.
 */
export const _listReportedPosts = async (
  filters: { status?: string; reason?: string; autoHiddenOnly?: boolean },
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const [{ items, total }, statusCounts, pendingPosts, autoHiddenPosts] =
    await Promise.all([
      listReportedPosts(filters, skip, take),
      countReportsByStatus(),
      countPostsWithPendingReports(),
      countAutoHiddenPosts(),
    ]);

  const rows = items.map((post: any) => {
    const timestamps = post.reports.map((r: any) => new Date(r.createdAt).getTime());
    return {
      post: {
        id: post.id,
        title: post.title,
        body: post.body,
        pdfUrl: post.pdfUrl,
        pdfName: post.pdfName,
        likeCount: post.likeCount,
        dislikeCount: post.dislikeCount,
        createdAt: post.createdAt,
        deletedAt: post.deletedAt,
        author: post.author,
      },
      openReportCount: post.reports.length,
      autoHidden: !!post.autoHiddenAt,
      autoHiddenAt: post.autoHiddenAt,
      ...summarizeReasons(post.reports),
      firstReportedAt: timestamps.length ? new Date(Math.min(...timestamps)) : null,
      lastReportedAt: timestamps.length ? new Date(Math.max(...timestamps)) : null,
      reports: post.reports.map((r: any) => ({
        id: r.id,
        reason: r.reason,
        reasonLabel: reportReasonLabel(r.reason),
        details: r.details,
        status: r.status,
        createdAt: r.createdAt,
        reporter: r.reporter,
      })),
    };
  });

  return response({
    error: false,
    message: "Reported posts retrieved",
    data: {
      items: rows,
      stats: {
        pendingPosts,
        autoHiddenPosts,
        pendingReports: statusCounts.pending || 0,
        actionedReports: statusCounts.actioned || 0,
        dismissedReports: statusCounts.dismissed || 0,
        autoHideThreshold: AUTO_HIDE_REPORT_THRESHOLD,
      },
      pagination: buildPagination(total, p, l),
    },
  });
};

export const _getReportedPost = async (postId: string): Promise<Response> => {
  const post: any = await findReportedPost(postId);
  if (!post) throw notFound("Post not found");
  const pending = post.reports.filter((r: any) => r.status === "pending");
  // Repeat-offender signal — how often this author has already had a post
  // removed on report. Materially changes how an admin weighs a borderline case.
  const priorRemovals = await countPriorRemovalsForAuthor(post.authorAccountId);

  return response({
    error: false,
    message: "Reported post retrieved",
    data: {
      post: {
        id: post.id,
        title: post.title,
        body: post.body,
        pdfUrl: post.pdfUrl,
        pdfName: post.pdfName,
        pdfSizeBytes: post.pdfSizeBytes,
        likeCount: post.likeCount,
        dislikeCount: post.dislikeCount,
        createdAt: post.createdAt,
        deletedAt: post.deletedAt,
        author: post.author,
      },
      openReportCount: pending.length,
      totalReportCount: post.reports.length,
      autoHidden: !!post.autoHiddenAt,
      autoHiddenAt: post.autoHiddenAt,
      authorPriorRemovals: priorRemovals,
      ...summarizeReasons(pending),
      reports: post.reports.map((r: any) => ({
        id: r.id,
        reason: r.reason,
        reasonLabel: reportReasonLabel(r.reason),
        details: r.details,
        status: r.status,
        createdAt: r.createdAt,
        reviewedAt: r.reviewedAt,
        resolutionNote: r.resolutionNote,
        reporter: r.reporter,
        reviewedByAdmin: r.reviewedByAdmin,
      })),
    },
  });
};

/**
 * Resolve every open report on a post in one decision.
 *
 * - `remove`  — soft-delete the post, reports stand as `actioned`. The author
 *               is told (with the reason) so a takedown is never silent, and
 *               the reporters are told their report went somewhere.
 * - `dismiss` — reports cleared, counter reset, any auto-hide lifted so the
 *               post returns to circulation. The author only hears about it if
 *               they'd been shown "under review"; the reporters aren't told
 *               they were overruled — low value, needlessly adversarial.
 */
export const _moderateReportedPost = async (
  adminId: string,
  postId: string,
  action: ModerationAction,
  reason?: string
): Promise<Response> => {
  if (action !== "remove" && action !== "dismiss") {
    throw badRequest("Action must be 'remove' or 'dismiss'");
  }
  const existing: any = await findReportedPost(postId);
  if (!existing) throw notFound("Post not found");
  if (action === "remove" && existing.deletedAt) {
    throw badRequest("Post is already removed");
  }

  const pendingReports = await findPendingReports(postId);
  if (pendingReports.length === 0 && action === "dismiss") {
    throw badRequest("This post has no open reports to dismiss");
  }

  const wasAutoHidden = !!existing.autoHiddenAt;
  const { post, resolvedCount } = await resolveReports(
    postId,
    action === "remove" ? "actioned" : "dismissed",
    adminId,
    reason
  );

  await recordAuditLog({
    adminAccountId: adminId,
    action: action === "remove" ? "report.remove_post" : "report.dismiss",
    targetType: "post",
    targetId: postId,
    reason,
    metadata: { resolvedReports: resolvedCount, wasAutoHidden },
  });

  if (action === "remove") {
    await dispatchNotification({
      recipientAccountId: existing.authorAccountId,
      type: "post_removed",
      payload: {
        postId,
        snippet: postSnippet(existing),
        reason: reason || "It broke our community guidelines.",
      },
      emailable: true,
    });
    // Close the loop for the people who flagged it — the single biggest driver
    // of whether anyone bothers reporting a second time.
    const notified = new Set<string>();
    for (const r of pendingReports) {
      if (notified.has(r.reporterAccountId)) continue;
      notified.add(r.reporterAccountId);
      await dispatchNotification({
        recipientAccountId: r.reporterAccountId,
        type: "report_reviewed",
        payload: { postId, outcome: "removed" },
        emailable: false,
      });
    }
  } else if (wasAutoHidden) {
    await dispatchNotification({
      recipientAccountId: existing.authorAccountId,
      type: "system",
      payload: {
        kind: "post_restored",
        postId,
        snippet: postSnippet(existing),
      },
      emailable: true,
    });
  }

  return response({
    error: false,
    message: action === "remove" ? "Post removed" : "Reports dismissed",
    data: { post, resolvedReports: resolvedCount },
  });
};
