// Membership plan catalog — source of truth for the seed (`prisma/seed.ts`).
// Prices are in kobo and computed/charged server-side only. The DB `Plan` rows
// are seeded from this and carry the Paystack plan code once created on Paystack.

export const PLAN_CODES = {
  community: "community",
  professionalLawyer: "professional_lawyer",
  professionalFirm: "professional_firm",
  professionalLawyerAnnual: "professional_lawyer_annual",
  professionalFirmAnnual: "professional_firm_annual",
} as const;

export const LAWYER_PRICE_KOBO = 3_500_000; // ₦35,000 / 6 months
export const FIRM_PRICE_KOBO = 5_000_000; // ₦50,000 / 6 months

// Billing terms a member can choose at checkout. Each term is its own Plan row
// (and its own Paystack plan) because Paystack fixes the interval on the plan —
// one plan cannot bill both biannually and annually.
export const INTERVAL_MONTHS = 6; // default term
export const ANNUAL_INTERVAL_MONTHS = 12;
export const BILLING_INTERVALS = [INTERVAL_MONTHS, ANNUAL_INTERVAL_MONTHS] as const;
export type BillingIntervalMonths = (typeof BILLING_INTERVALS)[number];

// Annual is simply two terms up front — no discount today. Changing this single
// number is all a "2 months free on annual" promo would take.
export const ANNUAL_PRICE_MULTIPLIER = 2;

export const isBillingInterval = (months: unknown): months is BillingIntervalMonths =>
  BILLING_INTERVALS.includes(months as BillingIntervalMonths);

export const INVOICE_PREFIX = "INV";

// Feature bullets shown on the "Change plan" comparison cards.
const COMMUNITY_FEATURES = [
  "Professional Profile",
  "Publish Articles",
  "Community Visibility",
  "Access to Public Events",
  "TLS Services",
];

// How many practice areas a Professional member may list. A firm fields a whole
// bench of lawyers across specialisms, so it gets a wider allowance than a solo
// practitioner. Community accounts (either role) keep a single primary area.
export const PROFESSIONAL_PRACTICE_AREA_LIMITS: Record<string, number> = {
  LAWYER: 2,
  FIRM: 7,
};
export const COMMUNITY_PRACTICE_AREA_LIMIT = 1;

export const professionalPracticeAreaLimit = (role: string): number =>
  PROFESSIONAL_PRACTICE_AREA_LIMITS[role] ?? PROFESSIONAL_PRACTICE_AREA_LIMITS.LAWYER;

// The plan-comparison card bullets. The practice-area line is generated from the
// same limit the API enforces, so the card can never promise a number that
// `PATCH /profile/me/practice-areas` then rejects.
const professionalFeatures = (role: "LAWYER" | "FIRM"): string[] => [
  "Everything in Community Membership",
  `Set up to ${professionalPracticeAreaLimit(role)} Practice Areas`,
  "Access to Client Leads",
  "Direct Messaging",
  "TLS Research",
  "TLS Library",
  "TLS News",
  "Priority Visibility",
  "Professional Opportunities",
];

const FIRM_ONLY_FEATURES = ["Firm Profile & Branding"];

export interface PlanSeed {
  code: string;
  name: string;
  tier: "community" | "professional";
  forRole: "LAWYER" | "FIRM" | null;
  priceKobo: number;
  intervalMonths: number;
  features: string[];
}

const lawyerFeatures = professionalFeatures("LAWYER");
const firmFeatures = [...professionalFeatures("FIRM"), ...FIRM_ONLY_FEATURES];

export const PLAN_SEEDS: PlanSeed[] = [
  {
    code: PLAN_CODES.community,
    name: "Community Membership",
    tier: "community",
    forRole: null,
    priceKobo: 0,
    intervalMonths: INTERVAL_MONTHS,
    features: COMMUNITY_FEATURES,
  },
  {
    code: PLAN_CODES.professionalLawyer,
    name: "Professional Membership (6 months)",
    tier: "professional",
    forRole: "LAWYER",
    priceKobo: LAWYER_PRICE_KOBO,
    intervalMonths: INTERVAL_MONTHS,
    features: lawyerFeatures,
  },
  {
    code: PLAN_CODES.professionalLawyerAnnual,
    name: "Professional Membership (1 year)",
    tier: "professional",
    forRole: "LAWYER",
    priceKobo: LAWYER_PRICE_KOBO * ANNUAL_PRICE_MULTIPLIER,
    intervalMonths: ANNUAL_INTERVAL_MONTHS,
    features: lawyerFeatures,
  },
  {
    code: PLAN_CODES.professionalFirm,
    name: "Professional Membership (6 months)",
    tier: "professional",
    forRole: "FIRM",
    priceKobo: FIRM_PRICE_KOBO,
    intervalMonths: INTERVAL_MONTHS,
    features: firmFeatures,
  },
  {
    code: PLAN_CODES.professionalFirmAnnual,
    name: "Professional Membership (1 year)",
    tier: "professional",
    forRole: "FIRM",
    priceKobo: FIRM_PRICE_KOBO * ANNUAL_PRICE_MULTIPLIER,
    intervalMonths: ANNUAL_INTERVAL_MONTHS,
    features: firmFeatures,
  },
];

// The professional plan code for a role and billing term. Defaults to the
// 6-month term so existing callers keep the behaviour they had.
export const professionalPlanCodeForRole = (
  role: string,
  intervalMonths: number = INTERVAL_MONTHS
): string | null => {
  const annual = intervalMonths === ANNUAL_INTERVAL_MONTHS;
  if (role === "LAWYER") {
    return annual ? PLAN_CODES.professionalLawyerAnnual : PLAN_CODES.professionalLawyer;
  }
  if (role === "FIRM") {
    return annual ? PLAN_CODES.professionalFirmAnnual : PLAN_CODES.professionalFirm;
  }
  return null;
};

// The limit that applies to a given account: role decides the professional
// allowance (lawyer 2 / firm 7), tier decides whether they get it at all.
export const practiceAreaLimitFor = (tier: string, role: string): number =>
  tier === "professional"
    ? professionalPracticeAreaLimit(role)
    : COMMUNITY_PRACTICE_AREA_LIMIT;
