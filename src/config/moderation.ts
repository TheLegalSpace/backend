import { ReportReason, ReportReasonOption } from "../interface/moderation";

/**
 * Number of distinct open reports that auto-hides a post pending admin review.
 * Deliberately low — Phase 1 has no 24/7 moderation, so the community needs to
 * be able to take obviously-bad content out of circulation on its own. An admin
 * dismissal restores the post, so a false positive is cheap and reversible.
 */
export const AUTO_HIDE_REPORT_THRESHOLD = 3;

export const REPORT_DETAILS_MAX = 1000;

/**
 * The reporter-facing taxonomy. Served by GET /posts/report-reasons so the
 * report sheet renders the same labels the backend validates against — the
 * frontend never hardcodes this list.
 *
 * The buckets are deliberately legal-platform specific: bad legal information,
 * people posing as lawyers, and leaked client confidences are the failure modes
 * that actually matter here, and generic "spam/abuse" options would bury them.
 */
export const REPORT_REASONS: ReportReasonOption[] = [
  {
    value: "misinformation",
    label: "Misleading legal information",
    description: "Legal claims that are false, outdated, or could mislead someone acting on them",
    requiresDetails: false,
  },
  {
    value: "impersonation",
    label: "Impersonation",
    description: "Pretending to be a lawyer, a law firm, or another person",
    requiresDetails: false,
  },
  {
    value: "confidentiality",
    label: "Confidential information",
    description: "Shares client details, case documents, or private information without consent",
    requiresDetails: false,
  },
  {
    value: "harassment",
    label: "Harassment or hate speech",
    description: "Attacks, threats, or slurs directed at a person or group",
    requiresDetails: false,
  },
  {
    value: "inappropriate",
    label: "Inappropriate content",
    description: "Sexual, graphic, or otherwise unprofessional content",
    requiresDetails: false,
  },
  {
    value: "spam",
    label: "Spam or advertising",
    description: "Repetitive, irrelevant, or purely promotional content",
    requiresDetails: false,
  },
  {
    value: "other",
    label: "Something else",
    description: "Tell us what's wrong with this post",
    requiresDetails: true,
  },
];

export const REPORT_REASON_VALUES: ReportReason[] = REPORT_REASONS.map((r) => r.value);

export const isValidReportReason = (value: string): value is ReportReason =>
  REPORT_REASON_VALUES.includes(value as ReportReason);

export const reportReasonRequiresDetails = (value: ReportReason): boolean =>
  REPORT_REASONS.find((r) => r.value === value)?.requiresDetails ?? false;

export const reportReasonLabel = (value: string): string =>
  REPORT_REASONS.find((r) => r.value === value)?.label ?? value;
