import { env } from "../config/env";
import {
  CheckStatus,
  TEST_NIN_MATCH,
  TEST_NIN_NO_MATCH,
  TEST_SCN_MATCH,
  TEST_SCN_NO_MATCH,
} from "../config/verification";

/**
 * The two metered identity checks behind the lawyer signup wizard:
 *
 *   - NBA directory lookup by SCN ("Your Bar details" -> Validate)
 *   - NIN lookup ("Verify your identity" -> Verify Identity)
 *
 * Both are flag-gated and OFF by default, because both cost money per call and
 * neither provider is wired up yet.
 *
 * While disabled they return `unchecked` — never a fake `matched`. A green
 * "NBA record matched" that means nothing is the single worst outcome available
 * here: it lets an impostor through the exact screen built to stop them, and it
 * would never show up in testing because it always passes. `unchecked` is a
 * first-class result that the logic layer surfaces honestly and leaves for the
 * admin to weigh.
 *
 * Wiring a provider in is a `PROVIDER TODO` below plus an env var. Prembly /
 * Identitypass and VerifyMe both expose SCN and NIN lookups; whichever is
 * chosen, the contract these functions return does not change.
 */

export interface IdentityCheckResult {
  status: CheckStatus;
  /** Provider-side id for the lookup, kept for audit. Never the NIN itself. */
  reference: string | null;
  /** Short, user-safe explanation. Rendered directly on the screen. */
  detail: string;
}

const unchecked = (detail: string): IdentityCheckResult => ({
  status: "unchecked",
  reference: null,
  detail,
});

/**
 * Force an outcome from a reserved test value.
 *
 * Only ever consulted outside production and only while the relevant provider
 * is disabled — so a wired-up provider's verdict can never be overridden by a
 * value someone types. Exists because an `unchecked`-only backend makes the
 * matched and mismatch screens unreachable, which leaves the frontend unable to
 * build them.
 */
const forcedOutcome = (
  value: string,
  matchValue: string,
  noMatchValue: string,
  providerEnabled: boolean
): IdentityCheckResult | null => {
  if (process.env.NODE_ENV === "production" || providerEnabled) return null;
  if (value === matchValue) {
    return { status: "matched", reference: "test-forced-match", detail: "Test value: forced match." };
  }
  if (value === noMatchValue) {
    return {
      status: "no_match",
      reference: "test-forced-no-match",
      detail: "Test value: forced mismatch.",
    };
  }
  return null;
};

/** Compare two human names for an exact, order-sensitive match.
 *
 * Order-sensitive on purpose: the screen tells the registrant "the name has to
 * be in this exact order", so accepting a reordering here would make that copy
 * a lie. Case and internal whitespace are normalised; nothing else is.
 */
export const namesMatch = (a: string, b: string): boolean =>
  a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * NBA directory check for a lawyer's bar details.
 *
 * The caller must already have established that the SCN is not registered on
 * the platform — that check is free, and running it first means a duplicate
 * never burns a paid lookup.
 */
export const checkNbaRecord = async (input: {
  scn: string;
  fullName: string;
  callToBarYear: number;
}): Promise<IdentityCheckResult> => {
  const forced = forcedOutcome(
    normalizeScn(input.scn),
    TEST_SCN_MATCH,
    TEST_SCN_NO_MATCH,
    env.nbaVerificationEnabled
  );
  if (forced) {
    console.log(`[identity] NBA check forced by test SCN -> ${forced.status}`);
    return forced;
  }

  if (!env.nbaVerificationEnabled) {
    console.log(
      `[identity] NBA check skipped (NBA_VERIFICATION_ENABLED=false) scn=${input.scn}`
    );
    return unchecked("Your bar details will be checked manually during review.");
  }

  if (!env.identityProviderBase || !env.identityProviderKey) {
    console.error("[identity] NBA check enabled but provider credentials are unset");
    return unchecked("Your bar details will be checked manually during review.");
  }

  // PROVIDER TODO: call the NBA-by-SCN endpoint, then compare the returned name
  // against `input.fullName` with `namesMatch` and the returned year of call
  // against `input.callToBarYear`. Return `matched` only when both agree.
  // A provider error must return `unchecked`, never `no_match` — "we couldn't
  // ask" and "we asked and it isn't them" are different things, and only one of
  // them should show the registrant a red screen.
  console.warn("[identity] NBA provider not implemented — returning unchecked");
  return unchecked("Your bar details will be checked manually during review.");
};

/**
 * NIN check against the name on the profile.
 *
 * `nin` is passed through to the provider and is never persisted or logged —
 * the consent copy on the screen promises exactly that.
 */
export const checkNin = async (input: {
  nin: string;
  fullName: string;
}): Promise<IdentityCheckResult> => {
  const forced = forcedOutcome(
    input.nin.trim(),
    TEST_NIN_MATCH,
    TEST_NIN_NO_MATCH,
    env.ninVerificationEnabled
  );
  if (forced) {
    console.log(`[identity] NIN check forced by test value -> ${forced.status}`);
    return forced;
  }

  if (!env.ninVerificationEnabled) {
    console.log("[identity] NIN check skipped (NIN_VERIFICATION_ENABLED=false)");
    return unchecked("Your identity will be checked manually during review.");
  }

  if (!env.identityProviderBase || !env.identityProviderKey) {
    console.error("[identity] NIN check enabled but provider credentials are unset");
    return unchecked("Your identity will be checked manually during review.");
  }

  // PROVIDER TODO: call the NIN lookup, compare the returned name against
  // `input.fullName` via `namesMatch`, return matched / no_match. On a provider
  // error return `unchecked` — a failed lookup must not consume one of the
  // registrant's two attempts as though they got it wrong.
  console.warn("[identity] NIN provider not implemented — returning unchecked");
  return unchecked("Your identity will be checked manually during review.");
};

/** NIN format: NIMC issues an 11-digit number. */
export const isValidNinFormat = (nin: string): boolean => /^\d{11}$/.test(nin.trim());

/**
 * SCN format. Accepts the canonical `SCN/2016/04821` and the bare number some
 * lawyers quote, normalising to upper case with internal spaces stripped.
 * Deliberately permissive — rejecting a real lawyer's correctly-remembered SCN
 * because of punctuation is a worse failure than passing an odd one to review.
 */
export const normalizeScn = (scn: string): string =>
  scn.trim().replace(/\s+/g, "").toUpperCase();

export const isValidScnFormat = (scn: string): boolean =>
  /^(SCN\/)?\d{2,4}\/?\d{2,6}$/.test(normalizeScn(scn)) || /^\d{4,8}$/.test(normalizeScn(scn));
