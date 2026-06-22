export type MembershipTier = "community" | "professional";

export type SubscriptionStatus =
  | "active"
  | "non_renewing"
  | "past_due"
  | "cancelled"
  | "expired";

export type MembershipPaymentStatus = "pending" | "success" | "failed";

export type InvoiceStatus = "paid" | "pending" | "failed";

export interface PlanView {
  id: string;
  code: string;
  name: string;
  tier: MembershipTier;
  forRole: string | null;
  priceKobo: number;
  intervalMonths: number;
  features: string[];
  isCurrent?: boolean;
}

export interface PaymentMethodView {
  cardBrand: string | null;
  cardLast4: string | null;
  expMonth: string | null;
  expYear: string | null;
  bank: string | null;
}

export interface MembershipView {
  tier: MembershipTier;
  status: SubscriptionStatus | "community";
  plan: PlanView | null;
  autoRenew: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  daysRemaining: number | null;
  paymentMethod: PaymentMethodView | null;
  availablePlans: PlanView[];
}

export interface SubscribeResult {
  authorizationUrl: string;
  reference: string;
  accessCode?: string;
  plan: PlanView;
}

// Normalized authorization captured from Paystack on a successful charge.
export interface PaystackAuthorization {
  authorization_code: string;
  last4?: string;
  card_type?: string;
  brand?: string;
  exp_month?: string;
  exp_year?: string;
  bank?: string;
  reusable?: boolean;
}
