import { prisma } from "../config/database";
import { response, notFound, forbidden, badRequest, conflict } from "../helpers/utility";
import { Response } from "../interface";
import { findAccountById } from "../dao/account";
import { invalidateAccountCache } from "../middleware/auth";
import { paginate, buildPagination } from "../helpers/pagination";
import { uploadToR2, MAX_ARTICLE_ASSET_BYTES } from "../services/storage";
import { dispatchNotification } from "../services/notification";
import { recordAuditLog } from "../dao/admin";
import {
  INITIAL_VERIFICATION_STATUS,
  UNDER_REVIEW_STATUS,
  DISPUTED_STATUS,
  FINAL_STATUSES,
  DISPUTE_EVIDENCE_DOC_TYPE,
  DISPUTE_STATUSES,
  DOC_TYPE_LABELS,
  MAX_IDENTITY_CHECK_ATTEMPTS,
  allowedDocTypes,
  requiredDocTypes,
  formatDisputeCaseReference,
} from "../config/verification";
import {
  checkNbaRecord,
  checkNin,
  isValidNinFormat,
  isValidScnFormat,
  normalizeScn,
} from "../services/identityVerification";
import {
  findLawyerProfileByAccount,
  findSatelliteProfile,
  updateSatelliteProfile,
  findLawyerProfileByScn,
  createLawyerProfileForVerification,
  updateLawyerProfileByAccount,
  consumeIdentityAttempt,
  listVerificationDocuments,
  createVerificationDocument,
  findDisputeByClaimantAndScn,
  findDisputeById,
  findLatestDisputeForClaimant,
  countDisputesInYear,
  createDispute,
  listOpenDisputes,
  resolveDispute,
} from "../dao/verification";

/**
 * Professional identity verification — the lawyer signup wizard's identity half.
 *
 *   bar details -> Call to Bar certificate -> NIN -> submit -> admin review
 *
 * Two things shape this module.
 *
 * The satellite profile is created at the **bar-details** step, not at profile
 * setup, because `verificationStatus` lives on it and every later step needs a
 * status to move. Its unique index on `scn` is therefore also the SCN
 * reservation: two registrants can never both get past bar details on one SCN.
 *
 * And nothing here ever writes `verified`. The NBA and NIN checks are evidence
 * an admin weighs; approval is only ever an admin action.
 */

const attemptsLeft = (profile: any): number =>
  Math.max(0, MAX_IDENTITY_CHECK_ATTEMPTS - (profile?.identityCheckAttempts ?? 0));

// ---------------------------------------------------------------------------
// Disclosure on the "This SCN is already registered" screen
// ---------------------------------------------------------------------------

/**
 * How much of the existing holder we reveal to someone who typed their SCN.
 *
 * Deliberately less than `services/anonymity.ts` shows: this is disclosed to a
 * stranger on the strength of an SCN they typed, so it is cut to the minimum
 * that lets the real holder recognise their own account ("oh, that's mine")
 * without handing a probe anything useful about someone else.
 *
 * SCNs are guessable — a year plus a short sequence — so the route is also rate
 * limited and requires an email-verified account, which means enumerating the
 * roster costs a signup per probe.
 */
const maskHolderName = (fullName: string): string =>
  (fullName || "")
    .trim()
    .split(/\s+/)
    .map((part, i) =>
      i === 0 ? part : `${part[0] ?? ""}${"*".repeat(Math.max(part.length - 1, 3))}`
    )
    .join(" ")
    .trim();

const maskHolderEmail = (email: string): string => {
  const [local, domain] = (email || "").split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
};

const holderStatusLabel = (account: any): string => {
  if (account.status !== "active") return "Inactive Account";
  const status = account.lawyerProfile?.verificationStatus;
  if (status === "verified") return "Active Account";
  if (status === UNDER_REVIEW_STATUS) return "Application Under Review";
  if (status === DISPUTED_STATUS) return "Disputed Account";
  if (status === "rejected") return "Rejected Account";
  return "Registration Incomplete";
};

const presentDispute = (d: any) => ({
  id: d.id,
  caseReference: d.caseReference,
  scn: d.scn,
  status: d.status,
  claimantStatement: d.claimantStatement,
  resolutionNote: d.resolutionNote,
  createdAt: d.createdAt,
  reviewedAt: d.reviewedAt,
  evidence: (d.evidence || []).map((e: any) => ({
    id: e.id,
    docType: e.docType,
    label: DOC_TYPE_LABELS[e.docType] || e.docType,
    createdAt: e.createdAt,
  })),
});

// ---------------------------------------------------------------------------
// Step 4 — Your Bar details
// ---------------------------------------------------------------------------

interface BarDetailsInput {
  fullName: string;
  scn: string;
  callToBarYear: number;
  nbaBranch?: string;
}

/**
 * Validate and claim a lawyer's bar details.
 *
 * Order matters and is the point: the free "is this SCN already taken" check
 * runs **before** the metered NBA lookup, so a duplicate never burns a paid
 * call. Returns one of four outcomes the frontend branches on:
 *
 *   already_registered — render "This SCN is already registered" plus the three
 *                        branches (fix it / I have an account / dispute)
 *   matched            — green "NBA record matched", continue
 *   unchecked          — no provider verdict; continue, an admin will check
 *   no_match           — the provider says these details are not that lawyer
 */
export const _submitBarDetails = async (
  accountId: string,
  authUserId: string,
  body: BarDetailsInput
): Promise<Response> => {
  const account = await findAccountById(accountId);
  if (!account) throw notFound("Account not found");

  if (account.role === "FIRM") {
    throw forbidden("Account type is set to firm — bar details apply to lawyer accounts");
  }
  if (account.role !== "PENDING_PROFESSIONAL" && account.role !== "LAWYER") {
    throw forbidden("Only professional accounts can submit bar details");
  }

  const scn = normalizeScn(body.scn);
  if (!isValidScnFormat(scn)) {
    throw badRequest("That doesn't look like a valid Supreme Court Number");
  }

  const fullName = body.fullName.trim().replace(/\s+/g, " ");
  if (fullName.split(" ").length < 2) {
    throw badRequest("Enter your full name exactly as you were called to bar");
  }

  const existingOwn = await findLawyerProfileByAccount(accountId);

  // A verified lawyer's SCN is frozen — the approval was granted against that
  // number. A rejected one may correct it: mistyping your own SCN is ordinary
  // human error, and refusing the correction would strand a real lawyer over a
  // typo. The abuse case — working through SCNs until one sticks — is handled by
  // making it visible rather than by blocking it: every claim is recorded below,
  // and every resubmission goes back through a human admin who can suspend.
  if (existingOwn && FINAL_STATUSES.includes(existingOwn.verificationStatus)) {
    throw conflict("Your bar details have already been approved. Contact support to change them.");
  }
  if (existingOwn && existingOwn.verificationStatus === UNDER_REVIEW_STATUS) {
    throw conflict("Your application is already under review.");
  }

  // --- free check first: is this SCN already on the platform?
  const holder = await findLawyerProfileByScn(scn);
  if (holder && holder.accountId !== accountId) {
    return response({
      error: false,
      message: "This SCN is already registered",
      data: {
        outcome: "already_registered",
        scn,
        existingAccount: {
          fullName: maskHolderName(holder.account.fullName),
          email: maskHolderEmail(holder.account.email),
          scn: holder.scn,
          statusLabel: holderStatusLabel(holder.account),
        },
      },
    });
  }

  // --- metered check second
  const nba = await checkNbaRecord({ scn, fullName, callToBarYear: body.callToBarYear });

  if (nba.status === "no_match") {
    // A definite provider "not them" neither creates nor moves a claim.
    return response({
      error: false,
      message: "We couldn't match these details to an NBA record",
      data: { outcome: "no_match", scn, nbaCheck: nba },
    });
  }

  const nextStatus =
    existingOwn?.verificationStatus === DISPUTED_STATUS
      ? DISPUTED_STATUS
      : INITIAL_VERIFICATION_STATUS;

  // Every SCN this account has ever claimed, appended whenever the number
  // changes. Correcting a typo is legitimate and stays cheap; working through
  // numbers until one sticks is the thing we actually care about, and it shows
  // up here as a list an admin can read. Blocking the change outright would
  // have punished the typo and only slowed the fraud, since the SCN is free to
  // re-type on a fresh signup.
  const priorFlags: any = (existingOwn?.verificationFlags as any) || {};
  const priorClaims: any[] = Array.isArray(priorFlags.scnClaims) ? priorFlags.scnClaims : [];
  const scnClaims =
    existingOwn && existingOwn.scn === scn
      ? priorClaims
      : [...priorClaims, { scn, at: new Date().toISOString() }];

  const profile = existingOwn
    ? await updateLawyerProfileByAccount(accountId, {
        scn,
        barFullName: fullName,
        callToBarYear: body.callToBarYear,
        nbaBranch: body.nbaBranch ?? null,
        nbaCheckStatus: nba.status,
        nbaCheckedAt: new Date(),
        verificationStatus: nextStatus,
        verificationFlags: { ...priorFlags, scnClaims },
      })
    : await createLawyerProfileForVerification({
        accountId,
        scn,
        barFullName: fullName,
        callToBarYear: body.callToBarYear,
        nbaBranch: body.nbaBranch ?? null,
        verificationStatus: INITIAL_VERIFICATION_STATUS,
        nbaCheckStatus: nba.status,
        verificationFlags: { scnClaims },
      });

  // The satellite now exists, so the account is a LAWYER from here on.
  if (account.role !== "LAWYER") {
    await prisma.account.update({ where: { id: accountId }, data: { role: "LAWYER" } });
  }
  await invalidateAccountCache(authUserId);

  return response({
    error: false,
    message: nba.status === "matched" ? "NBA record matched" : "Bar details saved",
    data: {
      outcome: nba.status === "matched" ? "matched" : "unchecked",
      scn,
      nbaCheck: nba,
      profile: {
        scn: profile.scn,
        barFullName: profile.barFullName,
        callToBarYear: profile.callToBarYear,
        nbaBranch: profile.nbaBranch,
        verificationStatus: profile.verificationStatus,
      },
    },
  });
};

// ---------------------------------------------------------------------------
// Step 4b — impersonation dispute
// ---------------------------------------------------------------------------

/**
 * "Someone is impersonating me. Flag for review."
 *
 * What this deliberately does **not** do is suspend the existing account. The
 * claimant is an unverified stranger who typed an SCN; if clicking the red
 * button could freeze a practising lawyer, the button is an attack. So:
 *
 *   - the claimant's own profile goes to `disputed` — unapprovable until an
 *     admin rules, which is the half of "neither can be approved" that can be
 *     enforced without collateral damage
 *   - the existing account is flagged (`verificationFlags.disputeOpen`), which
 *     blocks a pending approval, but a lawyer already verified keeps working
 *   - neither `Account.status` changes, which also means the claimant can still
 *     load their own "dispute under review" screen. Freezing the account would
 *     lock them out of the page telling them what happened.
 */
export const _raiseScnDispute = async (
  accountId: string,
  authUserId: string,
  body: { scn: string; statement?: string }
): Promise<Response> => {
  const account = await findAccountById(accountId);
  if (!account) throw notFound("Account not found");
  if (account.role !== "PENDING_PROFESSIONAL" && account.role !== "LAWYER") {
    throw forbidden("Only professional accounts can raise an SCN dispute");
  }

  const scn = normalizeScn(body.scn);
  const holder = await findLawyerProfileByScn(scn);
  if (!holder) throw notFound("That SCN is not registered, so there is nothing to dispute");
  if (holder.accountId === accountId) {
    throw badRequest("That SCN is already registered to you");
  }

  // Idempotent: clicking the button twice must not mint a second case reference
  // for the same complaint.
  const existing = await findDisputeByClaimantAndScn(accountId, scn);
  if (existing) {
    return response({
      error: false,
      message: "Dispute already flagged",
      data: { dispute: presentDispute(existing), alreadyFlagged: true },
    });
  }

  const year = new Date().getFullYear();
  const sequence = (await countDisputesInYear(year)) + 1;
  const caseReference = formatDisputeCaseReference(year, sequence);

  const dispute = await createDispute({
    caseReference,
    scn,
    claimantAccountId: accountId,
    existingAccountId: holder.accountId,
    claimantStatement: body.statement?.trim() || null,
  });

  // Claimant: unapprovable until resolved.
  const ownProfile = await findLawyerProfileByAccount(accountId);
  if (ownProfile) {
    await updateLawyerProfileByAccount(accountId, { verificationStatus: DISPUTED_STATUS });
  }

  // Existing holder: flagged, not suspended.
  const holderFlags = (holder.verificationFlags as any) || {};
  await updateLawyerProfileByAccount(holder.accountId, {
    verificationFlags: {
      ...holderFlags,
      disputeOpen: true,
      disputeCaseReference: caseReference,
    },
  });

  await invalidateAccountCache(authUserId);

  // The existing holder is told a claim was made, but not by whom — the
  // claimant's identity is exactly what is in question.
  await dispatchNotification({
    recipientAccountId: holder.accountId,
    type: "verification_update",
    payload: {
      status: "dispute_opened",
      caseReference,
      message:
        "Someone has disputed the Supreme Court Number on your profile. Our team is reviewing it.",
    },
  });

  return response({
    error: false,
    message: "Dispute flagged",
    data: { dispute: presentDispute(dispute), alreadyFlagged: false },
  });
};

export const _uploadDisputeEvidence = async (
  accountId: string,
  disputeId: string,
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<Response> => {
  const dispute = await findDisputeById(disputeId);
  if (!dispute) throw notFound("Dispute not found");
  if (dispute.claimantAccountId !== accountId) {
    throw forbidden("You can only add evidence to your own dispute");
  }
  if (dispute.status !== DISPUTE_STATUSES.open) {
    throw conflict("This dispute has already been resolved");
  }

  const { key } = await uploadToR2({
    buffer,
    mimetype,
    originalName: filename,
    folder: `disputes/${dispute.caseReference}`,
    maxBytes: MAX_ARTICLE_ASSET_BYTES,
    allowPdf: true,
  });

  await createVerificationDocument({
    accountId,
    docType: DISPUTE_EVIDENCE_DOC_TYPE,
    s3Key: key,
    disputeId,
  });

  const updated = await findDisputeById(disputeId);
  return response({
    error: false,
    message: "Evidence submitted",
    data: { dispute: presentDispute(updated) },
  });
};

export const _getMyDispute = async (accountId: string): Promise<Response> => {
  const dispute = await findLatestDisputeForClaimant(accountId);
  return response({
    error: false,
    message: dispute ? "Dispute retrieved" : "No dispute on file",
    data: { dispute: dispute ? presentDispute(dispute) : null },
  });
};

// ---------------------------------------------------------------------------
// Step 6 — Verify your identity (NIN)
// ---------------------------------------------------------------------------

/**
 * NIN check against the name on the profile.
 *
 * The NIN is passed to the provider and never persisted or logged — the consent
 * copy on the screen promises exactly that, so only the verdict, the provider
 * reference and the timestamp are kept.
 *
 * Attempts are capped server-side (`MAX_IDENTITY_CHECK_ATTEMPTS`) because every
 * attempt is a paid lookup and the client cannot be the thing that counts. An
 * `unchecked` result — provider off or provider down — deliberately does **not**
 * consume an attempt: a failed lookup is not the registrant getting it wrong.
 */
export const _verifyIdentity = async (
  accountId: string,
  authUserId: string,
  body: { nin: string; consent: boolean }
): Promise<Response> => {
  const account = await findAccountById(accountId);
  if (!account) throw notFound("Account not found");
  if (account.role !== "LAWYER") {
    throw forbidden("Complete your bar details before verifying your identity");
  }

  const profile = await findLawyerProfileByAccount(accountId);
  if (!profile) throw badRequest("Submit your bar details first");
  if (FINAL_STATUSES.includes(profile.verificationStatus)) {
    throw conflict("Your identity has already been verified");
  }
  if (!body.consent) {
    throw badRequest("We need your consent to verify your identity");
  }
  if (!isValidNinFormat(body.nin)) {
    throw badRequest("A National Identification Number is 11 digits");
  }

  if (profile.identityCheckStatus === "matched") {
    return response({
      error: false,
      message: "NIN record matched",
      data: {
        outcome: "matched",
        attemptsRemaining: attemptsLeft(profile),
        flaggedForReview: false,
      },
    });
  }

  if (attemptsLeft(profile) <= 0) {
    throw conflict(
      "You've used all your identity verification attempts. Our support team has been notified and will help you finish verifying."
    );
  }

  const nameToMatch = profile.barFullName || account.fullName;
  const result = await checkNin({ nin: body.nin, fullName: nameToMatch });

  // A provider verdict costs an attempt; "we couldn't ask" does not.
  const consumesAttempt = result.status !== "unchecked";
  const counted = consumesAttempt ? await consumeIdentityAttempt(accountId) : profile;

  await updateLawyerProfileByAccount(accountId, {
    identityCheckStatus: result.status,
    identityCheckedAt: new Date(),
    identityCheckReference: result.reference,
  });
  await invalidateAccountCache(authUserId);

  const remaining = attemptsLeft(counted);

  if (result.status === "no_match") {
    const flagged = remaining <= 0;
    if (flagged) {
      // Out of attempts. Flagged rather than blocked: leaving someone in limbo
      // with no record is worse than putting a case in front of an admin.
      const flags = (profile.verificationFlags as any) || {};
      await updateLawyerProfileByAccount(accountId, {
        verificationFlags: { ...flags, fraudReview: true },
      });
    }
    return response({
      error: false,
      message: "Name doesn't match",
      data: {
        outcome: "no_match",
        detail: `The name on this NIN doesn't match "${nameToMatch}". The name has to be in this exact order.`,
        attemptsRemaining: remaining,
        flaggedForReview: flagged,
      },
    });
  }

  return response({
    error: false,
    message: result.status === "matched" ? "NIN record matched" : "Identity details saved",
    data: {
      outcome: result.status === "matched" ? "matched" : "unchecked",
      detail: result.detail,
      attemptsRemaining: remaining,
      flaggedForReview: false,
    },
  });
};

// ---------------------------------------------------------------------------
// Step 7 — Complete Registration
// ---------------------------------------------------------------------------

/**
 * Submit the application for review: `pending` -> `under_review`, which is the
 * only status `listKycQueue` selects, so this is what actually puts a human in
 * the loop. Explicit rather than a side effect of the last upload, because the
 * design has a distinct "Complete Registration" button and the transition
 * should be the thing that button does.
 */
export const _submitApplication = async (
  accountId: string,
  authUserId: string
): Promise<Response> => {
  const account = await findAccountById(accountId);
  if (!account) throw notFound("Account not found");
  if (account.role !== "LAWYER" && account.role !== "FIRM") {
    throw forbidden("Only lawyer and firm accounts submit an application");
  }

  // Role-generic: `verificationStatus` lives on whichever satellite this
  // account has, and a firm has no LawyerProfile to read.
  const profile: any = await findSatelliteProfile(accountId, account.role);
  if (!profile) {
    throw badRequest(
      account.role === "FIRM"
        ? "Complete your firm profile before submitting your application"
        : "Submit your bar details first"
    );
  }

  // Only an approval closes this. A rejected applicant resubmits here after
  // fixing whatever the rejection reason named.
  if (FINAL_STATUSES.includes(profile.verificationStatus)) {
    throw conflict("Your application has already been approved");
  }
  if (profile.verificationStatus === DISPUTED_STATUS) {
    throw conflict("Your application can't be submitted while the SCN dispute is being reviewed");
  }
  if (profile.verificationStatus === UNDER_REVIEW_STATUS) {
    return response({
      error: false,
      message: "Your application is already under review",
      data: { verificationStatus: UNDER_REVIEW_STATUS, submitted: false },
    });
  }

  const docs = await listVerificationDocuments(accountId);
  const uploaded = new Set(docs.map((d: any) => d.docType));
  const missing = requiredDocTypes(account.role).filter((t) => !uploaded.has(t));
  if (missing.length) {
    throw badRequest(
      `Upload your ${missing.map((t) => DOC_TYPE_LABELS[t] || t).join(" and ")} before submitting`
    );
  }

  // The NIN step is lawyer-only for now — the firm identity flow (CAC lookup,
  // and whose NIN a firm submits) isn't built yet, so requiring it here would
  // leave every firm unable to submit.
  if (account.role === "LAWYER") {
    // `unchecked` passes — that is the provider being off, not the registrant
    // failing. A `no_match` with attempts still on the clock does not: they
    // should try again first.
    if (!profile.identityCheckStatus) {
      throw badRequest("Verify your identity before submitting your application");
    }
    if (profile.identityCheckStatus === "no_match" && attemptsLeft(profile) > 0) {
      throw badRequest("Verify your identity before submitting your application");
    }
  }

  await updateSatelliteProfile(accountId, account.role, {
    verificationStatus: UNDER_REVIEW_STATUS,
    applicationSubmittedAt: new Date(),
  });
  await invalidateAccountCache(authUserId);

  return response({
    error: false,
    message: "Your application has been submitted for review",
    data: { verificationStatus: UNDER_REVIEW_STATUS, submitted: true },
  });
};

// ---------------------------------------------------------------------------
// Verification state — the upload step, the completion screen, the badge
// ---------------------------------------------------------------------------

export const _getVerificationState = async (accountId: string): Promise<Response> => {
  const account = await findAccountById(accountId);
  if (!account) throw notFound("Account not found");
  if (account.role !== "LAWYER" && account.role !== "FIRM") {
    throw forbidden("Only LAWYER or FIRM accounts have a verification state");
  }

  const profile: any = account.lawyerProfile || account.firmProfile;
  const status = profile?.verificationStatus || INITIAL_VERIFICATION_STATUS;
  const docs = await listVerificationDocuments(accountId);
  const uploadedTypes = new Set(docs.map((d: any) => d.docType));
  const required = requiredDocTypes(account.role);
  const missing = required.filter((t) => !uploadedTypes.has(t));

  const describe = (t: string) => ({
    docType: t,
    label: DOC_TYPE_LABELS[t] || t,
    uploaded: uploadedTypes.has(t),
  });

  const lawyer: any = account.lawyerProfile;
  const identityStatus = lawyer?.identityCheckStatus ?? null;
  const identityAttemptsRemaining = lawyer ? attemptsLeft(lawyer) : null;
  const flags = (profile?.verificationFlags as any) || {};

  return response({
    error: false,
    message: "Verification state retrieved",
    data: {
      status,
      barDetails: lawyer
        ? {
            scn: lawyer.scn,
            barFullName: lawyer.barFullName,
            callToBarYear: lawyer.callToBarYear,
            nbaBranch: lawyer.nbaBranch,
            nbaCheckStatus: lawyer.nbaCheckStatus,
          }
        : null,
      identity: {
        status: identityStatus,
        attemptsRemaining: identityAttemptsRemaining,
        maxAttempts: MAX_IDENTITY_CHECK_ATTEMPTS,
        flaggedForReview: Boolean(flags.fraudReview),
      },
      requiredDocTypes: required.map(describe),
      optionalDocTypes: allowedDocTypes(account.role)
        .filter((t) => !required.includes(t))
        .map(describe),
      missingDocTypes: missing,
      uploaded: docs.map((d: any) => ({
        id: d.id,
        docType: d.docType,
        label: DOC_TYPE_LABELS[d.docType] || d.docType,
        status: d.status,
        rejectionReason: d.rejectionReason,
        createdAt: d.createdAt,
      })),
      applicationSubmittedAt: profile?.applicationSubmittedAt ?? null,
      canSubmitApplication:
        // `rejected` counts: the application endpoint accepts a resubmission,
        // and a flag here that disagreed with it would have the screen hiding
        // a button the API would have honoured.
        (status === INITIAL_VERIFICATION_STATUS || status === "rejected") &&
        missing.length === 0 &&
        // The identity step is lawyer-only until the firm flow is built.
        (account.role === "FIRM" ||
          (Boolean(identityStatus) &&
            !(identityStatus === "no_match" && (identityAttemptsRemaining ?? 0) > 0))),
      disputeOpen: Boolean(flags.disputeOpen),
      // Rejection is retryable, so the screen has to be able to say what to
      // change. Without this the applicant is told "not approved" and left to
      // guess which of four steps was wrong.
      rejectionReason: status === "rejected" ? flags.rejectionReason ?? null : null,
      rejectedAt: status === "rejected" ? flags.rejectedAt ?? null : null,
      canResubmit: status === "rejected",
    },
  });
};

// ---------------------------------------------------------------------------
// Admin — SCN dispute queue
// ---------------------------------------------------------------------------

export const _listScnDisputes = async (
  page: number,
  limit: number,
  status?: string
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { items, total } = await listOpenDisputes(skip, take, status);
  return response({
    error: false,
    message: "SCN disputes retrieved",
    data: {
      items: items.map((d: any) => ({
        ...presentDispute(d),
        claimant: {
          id: d.claimant.id,
          fullName: d.claimant.fullName,
          email: d.claimant.email,
          barFullName: d.claimant.lawyerProfile?.barFullName ?? null,
          verificationStatus: d.claimant.lawyerProfile?.verificationStatus ?? null,
          identityCheckStatus: d.claimant.lawyerProfile?.identityCheckStatus ?? null,
        },
        existingAccount: {
          id: d.existingAccount.id,
          fullName: d.existingAccount.fullName,
          email: d.existingAccount.email,
          barFullName: d.existingAccount.lawyerProfile?.barFullName ?? null,
          verificationStatus: d.existingAccount.lawyerProfile?.verificationStatus ?? null,
        },
      })),
      pagination: buildPagination(total, p, l),
    },
  });
};

/**
 * Rule on a dispute.
 *
 *   resolved_claimant — the claimant is the real holder. The SCN is released
 *                       from the existing account so the claimant can hold it,
 *                       and the existing account is rejected.
 *   resolved_existing — the existing holder keeps it; the claimant is rejected.
 *   dismissed         — nothing established. Both go back where they were.
 */
export const _resolveScnDispute = async (
  adminId: string,
  disputeId: string,
  outcome: "resolved_claimant" | "resolved_existing" | "dismissed",
  note?: string
): Promise<Response> => {
  const dispute = await findDisputeById(disputeId);
  if (!dispute) throw notFound("Dispute not found");
  if (dispute.status !== DISPUTE_STATUSES.open) {
    throw badRequest("This dispute has already been resolved");
  }

  const holderProfile = await findLawyerProfileByAccount(dispute.existingAccountId);
  const holderFlags: any = { ...((holderProfile?.verificationFlags as any) || {}) };
  delete holderFlags.disputeOpen;
  delete holderFlags.disputeCaseReference;

  await prisma.$transaction(async (tx) => {
    if (outcome === DISPUTE_STATUSES.resolvedClaimant) {
      // Free the SCN so the claimant can hold it, then reject the impostor.
      // Order matters: the unique index means the release has to land first.
      await tx.lawyerProfile.updateMany({
        where: { accountId: dispute.existingAccountId },
        data: { scn: null, verificationStatus: "rejected", verificationFlags: holderFlags },
      });
      await tx.lawyerProfile.updateMany({
        where: { accountId: dispute.claimantAccountId },
        data: { scn: dispute.scn, verificationStatus: UNDER_REVIEW_STATUS },
      });
    } else if (outcome === DISPUTE_STATUSES.resolvedExisting) {
      await tx.lawyerProfile.updateMany({
        where: { accountId: dispute.existingAccountId },
        data: { verificationFlags: holderFlags },
      });
      await tx.lawyerProfile.updateMany({
        where: { accountId: dispute.claimantAccountId },
        data: { verificationStatus: "rejected" },
      });
    } else {
      await tx.lawyerProfile.updateMany({
        where: { accountId: dispute.existingAccountId },
        data: { verificationFlags: holderFlags },
      });
      await tx.lawyerProfile.updateMany({
        where: { accountId: dispute.claimantAccountId },
        data: { verificationStatus: INITIAL_VERIFICATION_STATUS },
      });
    }
  });

  // Both sides just had their verification status rewritten, and
  // `requireVerifiedAccess` reads it from the 15-minute account cache. Left
  // stale, a ruling would take effect up to a quarter of an hour late — in both
  // directions: an account this outcome locks out keeps working, and one it
  // clears stays blocked.
  for (const accountId of [dispute.claimantAccountId, dispute.existingAccountId]) {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { authUserId: true },
    });
    if (account?.authUserId) await invalidateAccountCache(account.authUserId);
  }

  const resolved = await resolveDispute(disputeId, {
    status: outcome,
    resolutionNote: note ?? null,
    reviewedByAdminId: adminId,
  });

  await recordAuditLog({
    adminAccountId: adminId,
    action: `dispute.${outcome}`,
    targetType: "scn_dispute",
    targetId: disputeId,
    reason: note,
    metadata: { scn: dispute.scn, caseReference: dispute.caseReference },
  });

  for (const recipientAccountId of [dispute.claimantAccountId, dispute.existingAccountId]) {
    await dispatchNotification({
      recipientAccountId,
      type: "verification_update",
      payload: {
        status: "dispute_resolved",
        outcome,
        caseReference: dispute.caseReference,
        note,
      },
    });
  }

  return response({
    error: false,
    message: "Dispute resolved",
    data: { dispute: presentDispute(resolved) },
  });
};
