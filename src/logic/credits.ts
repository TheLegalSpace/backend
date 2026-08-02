import { response, badRequest, paymentRequired } from "../helpers/utility";
import { Response } from "../interface";
import { CreditWalletView, CreditTransactionView } from "../interface/credits";
import { paginate, buildPagination } from "../helpers/pagination";
import {
  CREDIT_PACKS,
  CREDITS_PER_RESEARCH,
  allowanceForRole,
  packByCode,
} from "../config/credits";
import { env } from "../config/env";
import { dispatchNotification } from "../services/notification";
import {
  getOrCreateWallet,
  creditWallet,
  spendFromWallet,
  findTransactionByReference,
  findAccountTransaction,
  recentTransactions,
  listTransactions,
} from "../dao/credits";
import * as paystack from "../services/paystack";

// ---- helpers ----

const toTxnView = (t: any): CreditTransactionView => ({
  id: t.id,
  type: t.type,
  amount: t.amount,
  balanceAfter: t.balanceAfter,
  reference: t.reference ?? null,
  metadata: t.metadata ?? null,
  createdAt: t.createdAt.toISOString(),
});

const sameMonth = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();

const monthRef = (d: Date) => `grant:${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;

// Lazily top up the account's included monthly allowance the first time it's seen
// in a new calendar month. Idempotent: guarded by both the wallet's
// lastMonthlyGrantAt and a per-month ledger reference. Only professional
// lawyers/firms receive an allowance. Credits roll over (we add, not top-up-to).
export const grantMonthlyIfDue = async (account: any): Promise<void> => {
  if (account.membershipTier !== "professional") return;
  const allowance = allowanceForRole(account.role);
  if (allowance <= 0) return;

  const wallet = await getOrCreateWallet(account.id);
  const now = new Date();
  if (wallet.lastMonthlyGrantAt && sameMonth(wallet.lastMonthlyGrantAt, now)) return;

  const ref = monthRef(now);
  const already = await findAccountTransaction(account.id, ref, "grant");
  if (already) return;

  await creditWallet({
    accountId: account.id,
    amount: allowance,
    type: "grant",
    reference: ref,
    metadata: {
      month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
      role: account.role,
    },
    stampMonthlyGrant: true,
  });
};

const buildWalletView = async (account: any): Promise<CreditWalletView> => {
  await grantMonthlyIfDue(account);
  const wallet = await getOrCreateWallet(account.id);
  const recent = await recentTransactions(account.id, 10);
  return {
    balance: wallet.balance,
    monthlyAllowance: allowanceForRole(account.role),
    lastMonthlyGrantAt: wallet.lastMonthlyGrantAt?.toISOString() ?? null,
    packs: CREDIT_PACKS,
    recentTransactions: recent.map(toTxnView),
  };
};

// Mirrors membership's callback resolver: allow a client-supplied callbackUrl only
// from an allowed origin (open-redirect guard), else default to FRONTEND_URL.
const resolveCallbackUrl = (raw?: string): URL => {
  if (!raw) return new URL("/credits/callback", env.frontendUrl);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest("callbackUrl must be an absolute URL");
  }
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const allowed =
    isLocalhost ||
    url.origin === new URL(env.frontendUrl).origin ||
    env.frontendAllowedOrigins.includes(url.origin);
  if (!allowed) throw badRequest("callbackUrl origin is not allowed");
  return url;
};

// ---- shared crediting (used by /verify and the Paystack webhook). Idempotent. ----

export const activateCreditPurchase = async (input: {
  accountId: string;
  packCode: string;
  reference: string;
  amountKobo?: number;
}): Promise<void> => {
  if (!input.reference) return;
  const already = await findTransactionByReference(input.reference);
  if (already) return; // already processed

  const pack = packByCode(input.packCode);
  if (!pack) {
    console.warn("[credits] unknown pack code on charge:", input.packCode, input.reference);
    return;
  }

  await creditWallet({
    accountId: input.accountId,
    amount: pack.credits,
    type: "purchase",
    reference: input.reference,
    metadata: {
      packCode: pack.code,
      credits: pack.credits,
      amountKobo: input.amountKobo ?? pack.priceKobo,
    },
  });

  await dispatchNotification({
    recipientAccountId: input.accountId,
    type: "credits_purchased",
    payload: { credits: pack.credits, packName: pack.name },
    emailable: true,
  }).catch(() => null);
};

// ---- public logic (HTTP) ----

export const _getCredits = async (account: any): Promise<Response> =>
  response({ error: false, message: "Credits retrieved", data: await buildWalletView(account) });

export const _listPacks = async (): Promise<Response> =>
  response({ error: false, message: "Credit packs retrieved", data: { items: CREDIT_PACKS } });

export const _listTransactions = async (
  accountId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { items, total } = await listTransactions(accountId, skip, take);
  return response({
    error: false,
    message: "Credit transactions retrieved",
    data: { items: items.map(toTxnView), pagination: buildPagination(total, p, l) },
  });
};

export const _purchaseCredits = async (
  account: any,
  packCode: string,
  callbackUrl?: string
): Promise<Response> => {
  const pack = packByCode(packCode);
  if (!pack) throw badRequest("Unknown credit pack");

  const redirect = resolveCallbackUrl(callbackUrl);
  const init = await paystack.initializeTransaction({
    email: account.email,
    amountKobo: pack.priceKobo, // server-side price — never trust the client
    callbackUrl: redirect.toString(),
    metadata: { kind: "credit_pack", packCode: pack.code, accountId: account.id },
  });

  return response({
    error: false,
    message: "Checkout initialized",
    data: {
      authorizationUrl: init.authorization_url,
      reference: init.reference,
      accessCode: init.access_code,
      pack,
    },
  });
};

export const _verifyCreditPurchase = async (
  account: any,
  reference: string
): Promise<Response> => {
  if (!reference) throw badRequest("reference is required");
  const data = await paystack.verifyTransaction(reference);
  if (data?.status !== "success") throw badRequest("Payment was not successful");

  const packCode = data?.metadata?.packCode;
  if (!packCode) throw badRequest("This payment is not a credit purchase");
  const accountId = data?.metadata?.accountId ?? account.id;

  await activateCreditPurchase({
    accountId,
    packCode,
    reference: data.reference,
    amountKobo: data.amount,
  });

  return response({ error: false, message: "Credits added", data: await buildWalletView(account) });
};

// ---- consumed by the research flow ----

// Grant this month's allowance if due, then require at least one credit before we
// run an (expensive) research turn. Throws 402 if the wallet is empty.
export const assertResearchCredit = async (account: any): Promise<void> => {
  await grantMonthlyIfDue(account);
  const wallet = await getOrCreateWallet(account.id);
  if (wallet.balance < CREDITS_PER_RESEARCH) {
    throw paymentRequired(
      "You're out of research credits. Top up to continue using TLS Research."
    );
  }
};

// Spend one credit for a produced research answer. Returns the remaining balance
// (or null if a rare race left the wallet empty — the caller already generated the
// answer, so we let it through and log rather than fail the user).
export const spendResearchCredit = async (
  account: any,
  ctx: { messageId: string; threadId: string }
): Promise<number | null> => {
  const wallet = await spendFromWallet({
    accountId: account.id,
    amount: CREDITS_PER_RESEARCH,
    reference: ctx.messageId,
    metadata: { threadId: ctx.threadId },
  });
  if (!wallet) {
    console.warn("[credits] spend raced to empty for account", account.id, ctx.messageId);
    return null;
  }
  return wallet.balance;
};
