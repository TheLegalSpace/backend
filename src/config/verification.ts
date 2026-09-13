// Professional verification (KYC) — the taxonomy behind the lawyer signup
// wizard's identity steps and the admin review queue.
//
// Status lifecycle on LawyerProfile / FirmProfile.verificationStatus:
//
//   pending      — satellite profile created at the bar-details step; the
//                  registrant is still walking the wizard
//   under_review — application submitted ("Complete Registration"); this is the
//                  status `dao/admin.ts → listKycQueue` selects on, so it is
//                  the only one an admin ever sees
//   disputed     — someone claimed this SCN was being used to impersonate them.
//                  Unapprovable until an admin resolves the dispute
//   verified     — an admin approved it
//   rejected     — an admin rejected it
//
// Nothing here auto-approves. The NBA and NIN checks are evidence an admin
// weighs, not a decision; `verified` is only ever written by an admin action.

export const INITIAL_VERIFICATION_STATUS = "pending";
export const UNDER_REVIEW_STATUS = "under_review";
export const DISPUTED_STATUS = "disputed";

// Statuses that close a verification step for good.
//
// `rejected` is deliberately not one of them — it is a retryable state, not a
// terminal one. Most rejections are clerical — a blurry certificate, the
// wrong document, a mistyped SCN or NIN — and permanently locking out a real
// lawyer over a photograph is out of all proportion to the mistake. So a
// rejected applicant may re-upload, re-run the identity check and resubmit; the
// admin reviews the new submission and approves or rejects again.
//
// Nothing is lost by allowing that, because the terminal control already exists
// somewhere better: `PATCH /admin/accounts/:id/suspend` sets `Account.status`,
// which the auth hook refuses outright. Someone who is not a lawyer gets
// suspended — a second terminal state living inside `verificationStatus` would
// only have duplicated it.
//
// `verified` stays closed: a cleared lawyer must not be able to quietly swap the
// documents or the SCN their approval was granted on.
export const FINAL_STATUSES = ["verified"];

// Every document type an account of this role may upload.
export const ALLOWED_DOC_TYPES: Record<string, string[]> = {
  LAWYER: ["call_to_bar_cert", "practicing_cert", "id_card"],
  FIRM: ["cac_cert"],
};

// The subset that must be present before an application can be submitted.
// Deliberately one document per role — the wizard asks for exactly one, and
// asking for more at the door is what onboarding drop-off is made of. The
// others stay uploadable and give an admin more to go on in a borderline case.
export const REQUIRED_DOC_TYPES: Record<string, string[]> = {
  LAWYER: ["call_to_bar_cert"],
  FIRM: ["cac_cert"],
};

// Evidence attached to an SCN impersonation dispute. Not in ALLOWED_DOC_TYPES:
// it is uploaded through the dispute endpoint, not the profile one.
export const DISPUTE_EVIDENCE_DOC_TYPE = "dispute_evidence";

// Labels the upload steps render, served from here so the string the user reads
// is the value the API validates.
export const DOC_TYPE_LABELS: Record<string, string> = {
  call_to_bar_cert: "Call to Bar Certificate",
  practicing_cert: "NBA Practicing Certificate",
  id_card: "Means of Identification",
  cac_cert: "Certificate of Incorporation",
  [DISPUTE_EVIDENCE_DOC_TYPE]: "Supporting evidence",
};

export const allowedDocTypes = (role: string): string[] => ALLOWED_DOC_TYPES[role] ?? [];
export const requiredDocTypes = (role: string): string[] => REQUIRED_DOC_TYPES[role] ?? [];

// ---------------------------------------------------------------------------
// Provider check outcomes
// ---------------------------------------------------------------------------

// `unchecked` is a first-class outcome, not an error: it is what a flag-gated
// provider returns while disabled, and what a provider outage returns. It means
// "no machine evidence either way" and leaves the decision to the admin.
export type CheckStatus = "unchecked" | "matched" | "no_match";

// How many times a registrant may attempt the NIN check. Each attempt is a paid
// lookup, so the ceiling is low and enforced server-side — the client cannot be
// the thing that counts.
export const MAX_IDENTITY_CHECK_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Non-production test values
// ---------------------------------------------------------------------------

// While the providers are off, a real lookup can only ever return `unchecked` —
// which means the "NBA record matched" / "NIN record matched" / "Name doesn't
// match" screens cannot be reached at all, and the frontend has no way to build
// or test them.
//
// These reserved values force an outcome so those branches are reachable. They
// are honoured ONLY when NODE_ENV !== "production" AND the relevant provider
// flag is off, so they can never influence a real check: once a provider is
// wired up its verdict is the only thing that counts.
export const TEST_NIN_MATCH = "11111111111";
export const TEST_NIN_NO_MATCH = "00000000000";
export const TEST_SCN_MATCH = "SCN/1111/11111";
export const TEST_SCN_NO_MATCH = "SCN/0000/00000";

// ---------------------------------------------------------------------------
// SCN disputes
// ---------------------------------------------------------------------------

export const DISPUTE_CASE_PREFIX = "DSP";

export const DISPUTE_STATUSES = {
  open: "open",
  resolvedClaimant: "resolved_claimant", // the claimant was the real holder
  resolvedExisting: "resolved_existing", // the existing account was
  dismissed: "dismissed", // neither established; no action taken
} as const;

export const OPEN_DISPUTE_STATUS = DISPUTE_STATUSES.open;

// DSP-2026-0091 — year plus a zero-padded per-year sequence, which is what the
// registrant is told to quote when they contact support.
export const formatDisputeCaseReference = (year: number, sequence: number): string =>
  `${DISPUTE_CASE_PREFIX}-${year}-${String(sequence).padStart(4, "0")}`;
