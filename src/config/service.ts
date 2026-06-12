import { ServiceRequestType, InquiryType, PromotionPricing } from "../interface/service";

export const SERVICE_TYPES: ServiceRequestType[] = [
  "website",
  "appointment",
  "productivity",
  "consulting",
  "event_promotion",
];

export const INQUIRY_TYPES: InquiryType[] = [
  "website",
  "appointment",
  "productivity",
  "consulting",
];

export const PROMOTION_DAILY_RATE_KOBO = 100_000; // ₦1,000 / day
export const PROMOTION_SOCIAL_ADDON_KOBO = 500_000; // ₦5,000 flat

/**
 * Inclusive day count between two dates, plus the promotion pricing breakdown.
 * Pricing is always computed server-side — never trusted from the client.
 */
export const computePromotionPricing = (
  startAt: Date,
  endAt: Date,
  shareOnSocial: boolean
): PromotionPricing => {
  const msPerDay = 24 * 60 * 60 * 1000;
  const startDay = Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate());
  const endDay = Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth(), endAt.getUTCDate());
  const days = Math.max(1, Math.floor((endDay - startDay) / msPerDay) + 1);
  const socialAddonKobo = shareOnSocial ? PROMOTION_SOCIAL_ADDON_KOBO : 0;
  const totalKobo = days * PROMOTION_DAILY_RATE_KOBO + socialAddonKobo;
  return {
    days,
    dailyRateKobo: PROMOTION_DAILY_RATE_KOBO,
    socialAddonKobo,
    totalKobo,
  };
};
