import { CreditPack } from "../interface/credits";

// Monthly included allowance per membership role — a small "taste", not a supply.
// Sized so that even fully used at our worst-case ~₦65/question cost it stays a
// fraction of the membership fee (so membership never loses money). Heavy users
// buy top-up packs. See docs/research-credits.md.
export const MONTHLY_ALLOWANCE: Record<string, number> = {
  LAWYER: 10,
  FIRM: 15,
};

export const allowanceForRole = (role: string): number => MONTHLY_ALLOWANCE[role] ?? 0;

// 1 credit per grounded research question (the two-pass widening is absorbed).
export const CREDITS_PER_RESEARCH = 1;

// Top-up packs. Prices in kobo, computed/charged server-side only — never trusted
// from the client. Per-credit rate stays above the ~₦65 worst-case cost.
export const CREDIT_PACKS: CreditPack[] = [
  { code: "small", name: "Small", credits: 20, priceKobo: 200_000 }, // ₦2,000 → ₦100/credit
  { code: "medium", name: "Medium", credits: 60, priceKobo: 500_000 }, // ₦5,000 → ₦83/credit
  { code: "bulk", name: "Bulk", credits: 250, priceKobo: 2_000_000 }, // ₦20,000 → ₦80/credit
];

export const packByCode = (code: string): CreditPack | undefined =>
  CREDIT_PACKS.find((p) => p.code === code);
