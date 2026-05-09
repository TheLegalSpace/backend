import { prisma } from "../config/database";
import { IntakeBudget, IntakePayload, IntakePreference } from "../interface";

const budgetToMaxKobo = (budget: IntakeBudget): number => {
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

const computeMatchedFactors = (
  account: any,
  practiceAreaId: string,
  city: string,
  country: string,
  budgetMaxKobo: number,
  preference: IntakePreference
): string[] => {
  const factors: string[] = [];
  const accountAreaIds: string[] =
    account.practiceAreaLinks?.map((l: any) => l.practiceAreaId) || [];
  if (accountAreaIds.includes(practiceAreaId)) factors.push("practice_area");
  if (account.locationCity === city) factors.push("location");
  else if (account.locationCountry === country) factors.push("country");
  const feeMin =
    account.lawyerProfile?.feeRangeMin ?? account.firmProfile?.feeRangeMin ?? 0;
  if (feeMin <= budgetMaxKobo) factors.push("fee_range");
  if (
    (preference === "lawyer" && account.role === "LAWYER") ||
    (preference === "firm" && account.role === "FIRM") ||
    preference === "either"
  ) {
    factors.push("preference");
  }
  if (Number(account.avgRating) > 0) factors.push("rating");
  return factors;
};

export const runMatchmaking = async (
  intake: IntakePayload,
  page = 1,
  limit = 20,
  countryFallback = "Nigeria"
): Promise<{ items: ScoredMatch[]; total: number }> => {
  const budgetMaxKobo = budgetToMaxKobo(intake.budget);
  const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
  const take = Math.min(100, Math.max(1, limit));

  const accounts = await prisma.account.findMany({
    where: {
      role: { in: ["LAWYER", "FIRM"] },
      status: "active",
      OR: [
        { lawyerProfile: { verificationStatus: "verified" } },
        { firmProfile: { verificationStatus: "verified" } },
      ],
      ...(intake.preference !== "either"
        ? { role: intake.preference === "lawyer" ? "LAWYER" : "FIRM" }
        : {}),
    },
    include: {
      lawyerProfile: true,
      firmProfile: true,
      practiceAreaLinks: true,
    },
  });

  const scored: ScoredMatch[] = accounts.map((acc) => {
    const accountAreaIds = acc.practiceAreaLinks.map((l) => l.practiceAreaId);
    const practiceMatch = accountAreaIds.includes(intake.matter) ? 40 : 0;
    let locationScore = 0;
    if (acc.locationCity === intake.location) locationScore = 20;
    else if (acc.locationCountry === countryFallback) locationScore = 10;
    const feeMin =
      acc.lawyerProfile?.feeRangeMin ?? acc.firmProfile?.feeRangeMin ?? 0;
    const feeScore = feeMin <= budgetMaxKobo ? 15 : 0;
    let preferenceScore = 0;
    if (intake.preference === "lawyer" && acc.role === "LAWYER") preferenceScore = 10;
    else if (intake.preference === "firm" && acc.role === "FIRM") preferenceScore = 10;
    else if (intake.preference === "either") preferenceScore = 10;
    const ratingScore = Number(acc.avgRating) * 2;
    const reviewScore = Math.min(acc.reviewCount, 50) * 0.1;
    const recencyScore =
      acc.lastActiveAt &&
      acc.lastActiveAt.getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
        ? 5
        : 0;
    const raw =
      practiceMatch + locationScore + feeScore + preferenceScore + ratingScore + reviewScore + recencyScore;
    const normalized = Math.round((raw / 105) * 100);
    return {
      account: acc,
      score: normalized,
      matchedFactors: computeMatchedFactors(
        acc,
        intake.matter,
        intake.location,
        countryFallback,
        budgetMaxKobo,
        intake.preference
      ),
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ar = Number(a.account.avgRating) || 0;
    const br = Number(b.account.avgRating) || 0;
    if (br !== ar) return br - ar;
    return (b.account.reviewCount || 0) - (a.account.reviewCount || 0);
  });

  const total = scored.length;
  const items = scored.slice(skip, skip + take);
  return { items, total };
};

export const computeRelevanceScore = async (
  intake: IntakePayload,
  lawyerAccountId: string
): Promise<number> => {
  const acc = await prisma.account.findUnique({
    where: { id: lawyerAccountId },
    include: {
      lawyerProfile: true,
      firmProfile: true,
      practiceAreaLinks: true,
    },
  });
  if (!acc) return 0;
  const budgetMaxKobo = budgetToMaxKobo(intake.budget);
  const accountAreaIds = acc.practiceAreaLinks.map((l) => l.practiceAreaId);
  const practiceMatch = accountAreaIds.includes(intake.matter) ? 40 : 0;
  let locationScore = 0;
  if (acc.locationCity === intake.location) locationScore = 20;
  else if (acc.locationCountry === "Nigeria") locationScore = 10;
  const feeMin = acc.lawyerProfile?.feeRangeMin ?? acc.firmProfile?.feeRangeMin ?? 0;
  const feeScore = feeMin <= budgetMaxKobo ? 15 : 0;
  let preferenceScore = 0;
  if (intake.preference === "lawyer" && acc.role === "LAWYER") preferenceScore = 10;
  else if (intake.preference === "firm" && acc.role === "FIRM") preferenceScore = 10;
  else if (intake.preference === "either") preferenceScore = 10;
  const ratingScore = Number(acc.avgRating) * 2;
  const reviewScore = Math.min(acc.reviewCount, 50) * 0.1;
  const recencyScore =
    acc.lastActiveAt && acc.lastActiveAt.getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
      ? 5
      : 0;
  const raw =
    practiceMatch + locationScore + feeScore + preferenceScore + ratingScore + reviewScore + recencyScore;
  return Math.round((raw / 105) * 100);
};
