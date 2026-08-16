import { prisma } from "../config/database";
import { IntakeBudget, IntakePayload, IntakePreference } from "../interface";
import {
  CANDIDATE_ROTATION_MS,
  SELECTION_BAND_POINTS,
  SELECTION_MIN_POOL,
} from "../config/matchmaking";

export const budgetToMaxKobo = (budget: IntakeBudget): number => {
  switch (budget) {
    case "under_100k":
      return 10_000_000;
    case "100k_to_500k":
      return 50_000_000;
    case "500k_to_2m":
      return 200_000_000;
    case "above_2m":
      return 999_999_999_999;
    default:
      return 999_999_999_999;
  }
};

export interface ScoredMatch {
  account: any;
  score: number;
  matchedFactors: string[];
}

/** Raw score ceiling — see `scoreAccount`. Normalisation divides by this. */
export const MAX_RAW_SCORE = 105;

// The lawyer/firm sets a fee range per practice area. Compare the client's budget
// against the *requested* area's minimum fee; fall back to the account-wide rollup
// (feeRangeMin) when the account doesn't carry that area.
export const feeMinForMatter = (account: any, matter: string): number => {
  const link = account.practiceAreaLinks?.find(
    (l: any) => l.practiceAreaId === matter
  );
  if (link) return link.feeMin ?? 0;
  return account.lawyerProfile?.feeRangeMin ?? account.firmProfile?.feeRangeMin ?? 0;
};

const preferenceScoreFor = (role: string, preference: IntakePreference): number => {
  if (preference === "either") return 10;
  if (preference === "lawyer" && role === "LAWYER") return 10;
  if (preference === "firm" && role === "FIRM") return 10;
  return 0;
};

/**
 * The single scoring implementation. Pure — takes a loaded account (with
 * `practiceAreaLinks`, `lawyerProfile`, `firmProfile`) and an intake, returns the
 * 0–100 score plus the factors that fired.
 *
 * Previously this maths was duplicated between the search path and the
 * relevance-score stamp on Request, which meant a tweak to one silently diverged
 * from the other. Both now call here.
 */
export const scoreAccount = (
  account: any,
  intake: IntakePayload,
  countryFallback = "Nigeria",
  now: number = Date.now()
): { score: number; raw: number; matchedFactors: string[] } => {
  const budgetMaxKobo = budgetToMaxKobo(intake.budget);
  const areaIds: string[] =
    account.practiceAreaLinks?.map((l: any) => l.practiceAreaId) || [];

  const matchedFactors: string[] = [];

  const practiceMatch = areaIds.includes(intake.matter) ? 40 : 0;
  if (practiceMatch) matchedFactors.push("practice_area");

  let locationScore = 0;
  if (account.locationCity && account.locationCity === intake.location) {
    locationScore = 20;
    matchedFactors.push("location");
  } else if (account.locationCountry === countryFallback) {
    locationScore = 10;
    matchedFactors.push("country");
  }

  const feeMin = feeMinForMatter(account, intake.matter);
  const feeScore = feeMin <= budgetMaxKobo ? 15 : 0;
  if (feeScore) matchedFactors.push("fee_range");

  const preferenceScore = preferenceScoreFor(account.role, intake.preference);
  if (preferenceScore) matchedFactors.push("preference");

  const ratingScore = Number(account.avgRating || 0) * 2;
  if (Number(account.avgRating || 0) > 0) matchedFactors.push("rating");

  const reviewScore = Math.min(account.reviewCount || 0, 50) * 0.1;

  const lastActive = account.lastActiveAt ? new Date(account.lastActiveAt).getTime() : 0;
  const recencyScore = lastActive > now - 7 * 24 * 60 * 60 * 1000 ? 5 : 0;

  const raw =
    practiceMatch +
    locationScore +
    feeScore +
    preferenceScore +
    ratingScore +
    reviewScore +
    recencyScore;

  return {
    raw,
    score: Math.round((raw / MAX_RAW_SCORE) * 100),
    matchedFactors,
  };
};

/**
 * Narrow a scored pool to the candidates that are genuinely in contention: those
 * within SELECTION_BAND_POINTS of the leader, widened to SELECTION_MIN_POOL
 * entries where the pool allows it.
 *
 * The band is what stops randomisation degrading match quality — we randomise
 * among good fits rather than across the whole roster.
 */
export const selectionBand = <T extends { score: number }>(
  scored: T[],
  bandPoints = SELECTION_BAND_POINTS,
  minPool = SELECTION_MIN_POOL
): T[] => {
  if (scored.length === 0) return [];
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const top = sorted[0].score;
  const withinBand = sorted.filter((c) => c.score >= top - bandPoints);
  if (withinBand.length >= minPool) return withinBand;
  return sorted.slice(0, Math.min(minPool, sorted.length));
};

/**
 * Score-weighted draw. A better match is likelier, but never certain — which is
 * the point: a deterministic "always the best/cheapest" pick is exactly what lets
 * a client reverse-engineer the pricing table by repeating searches.
 *
 * `rand` is injectable so the behaviour is testable without a seeded global.
 */
export const pickWeighted = <T extends { score: number }>(
  candidates: T[],
  rand: () => number = Math.random
): T | null => {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  // Floor each weight at 1 so a zero-scoring candidate is still reachable and the
  // total can never be 0.
  const weights = candidates.map((c) => Math.max(1, c.score));
  const total = weights.reduce((a, b) => a + b, 0);
  let ticket = rand() * total;
  for (let i = 0; i < candidates.length; i++) {
    ticket -= weights[i];
    if (ticket < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
};

/**
 * Apply candidate rotation: prefer accounts this user has not been offered
 * recently. Soft by design — if holding everyone back would leave nothing to
 * offer, previously-seen candidates return, least-recently-shown first. An empty
 * "Get a Lawyer" result is a worse failure than a repeat.
 */
export const applyRotation = <T extends { account: { id: string } }>(
  scored: T[],
  lastShownAt: Map<string, number>
): { pool: T[]; rotated: boolean } => {
  const fresh = scored.filter((c) => !lastShownAt.has(c.account.id));
  if (fresh.length > 0) return { pool: fresh, rotated: true };
  const byStalest = [...scored].sort(
    (a, b) =>
      (lastShownAt.get(a.account.id) ?? 0) - (lastShownAt.get(b.account.id) ?? 0)
  );
  return { pool: byStalest, rotated: false };
};

const CANDIDATE_INCLUDE = {
  lawyerProfile: true,
  firmProfile: true,
  practiceAreaLinks: true,
} as const;

const baseCandidateWhere = (intake: IntakePayload) => {
  const roleFilter =
    intake.preference === "lawyer"
      ? ["LAWYER"]
      : intake.preference === "firm"
      ? ["FIRM"]
      : ["LAWYER", "FIRM"];
  return {
    role: { in: roleFilter },
    status: "active",
    // Only Professional members are surfaced in matchmaking — this is both the
    // "Access to Client Leads" gate and "Priority Visibility" (community accounts
    // are not shown at all, so professionals are always ranked above them).
    membershipTier: "professional",
    OR: [
      { lawyerProfile: { verificationStatus: "verified" } },
      { firmProfile: { verificationStatus: "verified" } },
    ],
    // Hard filter, not a score bump. Previously practice area only contributed
    // points, so every professional account came back on every search — which
    // handed the client the whole roster (and its pricing) in one call.
    practiceAreaLinks: { some: { practiceAreaId: intake.matter } },
  };
};

/**
 * Eligible candidates for an intake: correct role, active, Professional, verified,
 * carrying the requested practice area, and priced at or under the stated budget.
 *
 * Returns `budgetRelaxed` when nobody was in budget and the fee ceiling had to be
 * dropped to avoid a dead end — the caller surfaces that so the client is told
 * plainly rather than quietly shown someone they cannot afford.
 */
export const findEligibleCandidates = async (
  intake: IntakePayload
): Promise<{ accounts: any[]; budgetRelaxed: boolean }> => {
  const budgetMaxKobo = budgetToMaxKobo(intake.budget);
  const where = baseCandidateWhere(intake);

  const inBudget = await prisma.account.findMany({
    where: {
      ...where,
      practiceAreaLinks: {
        some: { practiceAreaId: intake.matter, feeMin: { lte: budgetMaxKobo } },
      },
    },
    include: CANDIDATE_INCLUDE,
  });
  if (inBudget.length > 0) return { accounts: inBudget, budgetRelaxed: false };

  const anyPrice = await prisma.account.findMany({
    where,
    include: CANDIDATE_INCLUDE,
  });
  return { accounts: anyPrice, budgetRelaxed: anyPrice.length > 0 };
};

/**
 * Accounts already offered to this user inside the rotation window, mapped to
 * when they were last shown.
 */
export const recentlyOfferedTo = async (
  userAccountId: string,
  now: Date = new Date()
): Promise<Map<string, number>> => {
  const since = new Date(now.getTime() - CANDIDATE_ROTATION_MS);
  const rows = await prisma.matchOffer.findMany({
    where: { userAccountId, createdAt: { gte: since } },
    select: { offeredAccountId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    const t = r.createdAt.getTime();
    if (!map.has(r.offeredAccountId) || t > (map.get(r.offeredAccountId) as number)) {
      map.set(r.offeredAccountId, t);
    }
  }
  return map;
};

export interface OfferSelection {
  picks: ScoredMatch[];
  budgetRelaxed: boolean;
  eligibleCount: number;
}

/**
 * Pick the accounts to offer: at most one LAWYER and at most one FIRM, honouring
 * the intake's preference.
 *
 * Filter hard → score → hold back recently-seen → keep the top band → weighted
 * draw. Each role is drawn independently so a client always gets one of each where
 * both exist.
 */
export const selectOfferCandidates = async (
  intake: IntakePayload,
  userAccountId: string,
  opts: { rand?: () => number; now?: Date; countryFallback?: string } = {}
): Promise<OfferSelection> => {
  const rand = opts.rand ?? Math.random;
  const now = opts.now ?? new Date();
  const countryFallback = opts.countryFallback ?? "Nigeria";

  const { accounts, budgetRelaxed } = await findEligibleCandidates(intake);
  if (accounts.length === 0) {
    return { picks: [], budgetRelaxed: false, eligibleCount: 0 };
  }

  const lastShownAt = await recentlyOfferedTo(userAccountId, now);

  const scored: ScoredMatch[] = accounts.map((account) => {
    const { score, matchedFactors } = scoreAccount(
      account,
      intake,
      countryFallback,
      now.getTime()
    );
    return { account, score, matchedFactors };
  });

  const roles =
    intake.preference === "lawyer"
      ? ["LAWYER"]
      : intake.preference === "firm"
      ? ["FIRM"]
      : ["LAWYER", "FIRM"];

  const picks: ScoredMatch[] = [];
  for (const role of roles) {
    const ofRole = scored.filter((c) => c.account.role === role);
    if (ofRole.length === 0) continue;
    const { pool } = applyRotation(ofRole, lastShownAt);
    const band = selectionBand(pool);
    const pick = pickWeighted(band, rand);
    if (pick) picks.push(pick);
  }

  return { picks, budgetRelaxed, eligibleCount: accounts.length };
};

/**
 * Score a single account against an intake — used to stamp `Request.relevanceScore`
 * at creation for analytics.
 */
export const computeRelevanceScore = async (
  intake: IntakePayload,
  lawyerAccountId: string
): Promise<number> => {
  const acc = await prisma.account.findUnique({
    where: { id: lawyerAccountId },
    include: CANDIDATE_INCLUDE,
  });
  if (!acc) return 0;
  return scoreAccount(acc, intake).score;
};
