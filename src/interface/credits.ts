// TLS Research credits. 1 credit = 1 grounded research question.
// See docs/research-credits.md for the pricing rationale.

export type CreditTransactionType =
  | "grant" // monthly included allowance
  | "purchase" // bought a top-up pack
  | "spend" // consumed by a research answer
  | "refund"
  | "adjustment"; // admin correction

export interface CreditPack {
  code: string;
  name: string;
  credits: number;
  priceKobo: number;
}

export interface CreditTransactionView {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  reference: string | null;
  metadata: any;
  createdAt: string;
}

export interface CreditWalletView {
  balance: number;
  monthlyAllowance: number;
  lastMonthlyGrantAt: string | null;
  packs: CreditPack[];
  recentTransactions: CreditTransactionView[];
}

export interface PurchaseCreditsResult {
  authorizationUrl: string;
  reference: string;
  accessCode?: string;
  pack: CreditPack;
}
