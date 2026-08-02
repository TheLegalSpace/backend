export type ReportReason =
  | "spam"
  | "harassment"
  | "misinformation"
  | "inappropriate"
  | "impersonation"
  | "confidentiality"
  | "other";

export type ReportStatus = "pending" | "actioned" | "dismissed";

export type ModerationAction = "remove" | "dismiss";

/** A reason as presented to the reporter — the frontend renders this list verbatim. */
export interface ReportReasonOption {
  value: ReportReason;
  label: string;
  /** Sub-label shown under the option so the reporter picks the right bucket. */
  description: string;
  /** When true the client must collect free-text `details` before submitting. */
  requiresDetails: boolean;
}
