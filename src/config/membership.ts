// Membership plan catalog — source of truth for the seed (`prisma/seed.ts`).
// Prices are in kobo and computed/charged server-side only. The DB `Plan` rows
// are seeded from this and carry the Paystack plan code once created on Paystack.

export const PLAN_CODES = {
  community: "community",
  professionalLawyer: "professional_lawyer",
  professionalFirm: "professional_firm",
} as const;

export const LAWYER_PRICE_KOBO = 3_500_000; // ₦35,000 / 6 months
export const FIRM_PRICE_KOBO = 5_000_000; // ₦50,000 / 6 months
export const INTERVAL_MONTHS = 6;

export const INVOICE_PREFIX = "INV";

// Feature bullets shown on the "Change plan" comparison cards.
const COMMUNITY_FEATURES = [
  "Professional Profile",
  "Publish Articles",
  "Community Visibility",
  "Access to Public Events",
  "TLS Services",
];

const PROFESSIONAL_EXTRA_FEATURES = [
  "Everything in Community Membership",
  "Set up to 3 Practice Areas",
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
    name: "Professional Membership",
    tier: "professional",
    forRole: "LAWYER",
    priceKobo: LAWYER_PRICE_KOBO,
    intervalMonths: INTERVAL_MONTHS,
    features: PROFESSIONAL_EXTRA_FEATURES,
  },
  {
    code: PLAN_CODES.professionalFirm,
    name: "Professional Membership",
    tier: "professional",
    forRole: "FIRM",
    priceKobo: FIRM_PRICE_KOBO,
    intervalMonths: INTERVAL_MONTHS,
    features: [...PROFESSIONAL_EXTRA_FEATURES, ...FIRM_ONLY_FEATURES],
  },
];

// The professional plan code for a given role.
export const professionalPlanCodeForRole = (role: string): string | null => {
  if (role === "LAWYER") return PLAN_CODES.professionalLawyer;
  if (role === "FIRM") return PLAN_CODES.professionalFirm;
  return null;
};

// Maximum practice areas a professional lawyer/firm may set ("Set up to 3 Practice Areas").
export const PROFESSIONAL_PRACTICE_AREA_LIMIT = 3;
// Community accounts can still list a single primary area.
export const COMMUNITY_PRACTICE_AREA_LIMIT = 1;

export const practiceAreaLimitForTier = (tier: string): number =>
  tier === "professional" ? PROFESSIONAL_PRACTICE_AREA_LIMIT : COMMUNITY_PRACTICE_AREA_LIMIT;
