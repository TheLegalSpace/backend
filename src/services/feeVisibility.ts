/**
 * Fee visibility.
 *
 * Product decision: clients are never shown what a lawyer or firm charges. Fees
 * exist to filter matches server-side (a client is only ever matched with someone
 * inside their stated budget) but the figure itself is not a client-facing number.
 *
 * Only the account itself and admins see fees. That keeps the platform a matching
 * service rather than a price list — the concern being that a browsable set of
 * fees lets clients shop on price and negotiate off-platform.
 *
 * Because a client cannot see the price before spending one of a small number of
 * weekly match attempts, the *affordability* signal has to survive even though the
 * number does not — see `budgetRelaxed` on the match offer, which tells the client
 * plainly when nobody was within their budget and the ceiling had to be lifted.
 */

const PROFILE_FEE_KEYS = ["feeRangeMin", "feeRangeMax"] as const;

const stripProfileFees = (profile: any) => {
  if (!profile || typeof profile !== "object") return profile;
  const copy = { ...profile };
  for (const k of PROFILE_FEE_KEYS) delete copy[k];
  return copy;
};

/**
 * Remove every fee field from an account payload, in all the shapes it travels in:
 * the profile rollups (`feeRangeMin`/`feeRangeMax`), the raw `practiceAreaLinks`
 * rows (`feeMin`/`feeMax`), and the `practiceAreas` array that `enrichProfile`
 * builds (`minFee`/`maxFee`).
 *
 * Returns a copy — never mutates the Prisma row, which may be shared.
 */
export const redactFees = <T extends Record<string, any>>(account: T): T => {
  if (!account || typeof account !== "object") return account;
  const copy: any = { ...account };

  if (copy.lawyerProfile) copy.lawyerProfile = stripProfileFees(copy.lawyerProfile);
  if (copy.firmProfile) copy.firmProfile = stripProfileFees(copy.firmProfile);

  if (Array.isArray(copy.practiceAreaLinks)) {
    copy.practiceAreaLinks = copy.practiceAreaLinks.map((l: any) => {
      if (!l || typeof l !== "object") return l;
      const { feeMin, feeMax, ...rest } = l;
      return rest;
    });
  }

  if (Array.isArray(copy.practiceAreas)) {
    copy.practiceAreas = copy.practiceAreas.map((a: any) => {
      if (!a || typeof a !== "object") return a;
      const { minFee, maxFee, ...rest } = a;
      return rest;
    });
  }

  return copy as T;
};

/**
 * Whether `viewer` may see `targetAccountId`'s fees: only themselves, and admins.
 *
 * Deliberately synchronous — the rule depends on nothing but who is asking, so no
 * surface pays a database round-trip to redact.
 */
export const canSeeFees = (
  viewerAccountId: string | null | undefined,
  viewerRole: string | null | undefined,
  targetAccountId: string
): boolean => {
  if (!viewerAccountId) return false;
  if (viewerRole === "ADMIN") return true;
  return viewerAccountId === targetAccountId;
};

/**
 * The one call sites should use: hand it an account payload and who is looking,
 * get back the payload with fees stripped unless they're entitled to them.
 */
export const applyFeeVisibility = <T extends Record<string, any>>(
  account: T,
  viewerAccountId: string | null | undefined,
  viewerRole?: string | null
): T => {
  if (!account) return account;
  return canSeeFees(viewerAccountId, viewerRole, account.id) ? account : redactFees(account);
};

/** Array convenience — same rule, applied per row. */
export const applyFeeVisibilityAll = <T extends Record<string, any>>(
  accounts: T[],
  viewerAccountId: string | null | undefined,
  viewerRole?: string | null
): T[] => (accounts || []).map((a) => applyFeeVisibility(a, viewerAccountId, viewerRole));
