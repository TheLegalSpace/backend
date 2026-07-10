import { response, badRequest, conflict, forbidden, notFound, serviceUnavailable } from "../helpers/utility";
import { Response } from "../interface";
import { MembershipView, PlanView } from "../interface/membership";
import { paginate, buildPagination } from "../helpers/pagination";
import { professionalPlanCodeForRole, INVOICE_PREFIX } from "../config/membership";
import { env } from "../config/env";
import { dispatchNotification } from "../services/notification";
import { generateInvoicePdf } from "../services/invoice";
import { invalidateAccountCache } from "../middleware/auth";
import { findAccountById, findAccountByEmail, updateAccount } from "../dao/account";
import {
  getPlanByCode,
  getPlanById,
  getPlanByPaystackCode,
  getPlansForRole,
  getSubscriptionByAccount,
  findSubscriptionByPaystackCode,
  upsertSubscription,
  updateSubscription,
  setAccountMembership,
  getDefaultPaymentMethod,
  upsertPaymentMethod,
  findPaymentByReference,
  createPayment,
  countInvoicesThisYear,
  createInvoice,
  updateInvoice,
  listInvoicesByAccount,
  getInvoiceById,
} from "../dao/membership";
import * as paystack from "../services/paystack";
import { activatePromotionFromCharge } from "./service";

// ---- helpers ----

const addMonths = (date: Date, months: number): Date => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

const toPlanView = (p: any, currentPlanId?: string): PlanView => ({
  id: p.id,
  code: p.code,
  name: p.name,
  tier: p.tier,
  forRole: p.forRole ?? null,
  priceKobo: p.priceKobo,
  intervalMonths: p.intervalMonths,
  features: Array.isArray(p.features) ? p.features : [],
  isCurrent: currentPlanId ? p.id === currentPlanId : undefined,
});

const daysBetween = (end: Date): number => {
  const ms = end.getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
};

const buildView = async (account: any): Promise<MembershipView> => {
  const [sub, plans, pm] = await Promise.all([
    getSubscriptionByAccount(account.id),
    getPlansForRole(account.role),
    getDefaultPaymentMethod(account.id),
  ]);
  const currentPlanId = sub?.planId;
  return {
    tier: account.membershipTier === "professional" ? "professional" : "community",
    status: (sub?.status as any) ?? "community",
    plan: sub?.plan ? toPlanView(sub.plan, currentPlanId) : null,
    autoRenew: sub?.autoRenew ?? false,
    currentPeriodStart: sub?.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
    daysRemaining: sub?.currentPeriodEnd ? daysBetween(sub.currentPeriodEnd) : null,
    paymentMethod: pm
      ? {
          cardBrand: pm.cardBrand,
          cardLast4: pm.cardLast4,
          expMonth: pm.expMonth,
          expYear: pm.expYear,
          bank: pm.bank,
        }
      : null,
    availablePlans: plans.map((p) => toPlanView(p, currentPlanId)),
  };
};

const nextInvoiceNumber = async (): Promise<string> => {
  const year = new Date().getFullYear();
  const count = await countInvoicesThisYear(year);
  return `${INVOICE_PREFIX}-${year}-${String(count + 1).padStart(6, "0")}`;
};

// Shared activation used by both /verify and the webhook. Idempotent on the charge reference.
const activateFromCharge = async (
  account: any,
  plan: any,
  charge: {
    reference: string;
    amountKobo: number;
    channel?: string | null;
    authorization?: any;
    customerCode?: string | null;
  }
): Promise<void> => {
  if (!charge.reference) return;
  const existing = await findPaymentByReference(charge.reference);
  if (existing) return; // already processed

  // Plans are priced per account type, and the account type can change during
  // onboarding after a checkout was initialized. If this charge is for a plan
  // that no longer matches the account's role: realign the role while no profile
  // exists yet (the payment is the strongest signal of intent), or refuse once
  // setup has completed for the other type — otherwise a firm could pay the
  // cheaper lawyer price through a stale checkout.
  if (plan.forRole && account.role !== plan.forRole) {
    const fresh = await findAccountById(account.id);
    if (fresh?.lawyerProfile || fresh?.firmProfile) {
      throw badRequest(
        "This payment was made for a different account type. Please contact support to resolve it."
      );
    }
    await updateAccount(account.id, { role: plan.forRole });
    account = { ...account, role: plan.forRole };
    await invalidateAccountCache(account.authUserId);
  }

  const isRenewal = account.membershipTier === "professional";
  const now = new Date();
  const periodStart = now;
  const periodEnd = addMonths(now, plan.intervalMonths);
  const auth = charge.authorization || {};

  const sub = await upsertSubscription(account.id, {
    planId: plan.id,
    status: "active",
    autoRenew: true,
    paystackCustomerCode: charge.customerCode ?? undefined,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
  });

  const payment = await createPayment({
    accountId: account.id,
    subscriptionId: sub.id,
    paystackReference: charge.reference,
    amountKobo: charge.amountKobo,
    status: "success",
    channel: charge.channel ?? null,
    cardLast4: auth.last4 ?? null,
    cardBrand: auth.brand ?? auth.card_type ?? null,
    paidAt: now,
    gatewayResponse: charge,
  });

  if (auth.authorization_code) {
    await upsertPaymentMethod(account.id, {
      paystackAuthorizationCode: auth.authorization_code,
      cardLast4: auth.last4 ?? null,
      cardBrand: auth.brand ?? auth.card_type ?? null,
      expMonth: auth.exp_month ?? null,
      expYear: auth.exp_year ?? null,
      bank: auth.bank ?? null,
    });
  }

  await setAccountMembership(account.id, "professional", periodEnd);
  await invalidateAccountCache(account.authUserId);

  const invoiceNumber = await nextInvoiceNumber();
  const invoice = await createInvoice({
    accountId: account.id,
    subscriptionId: sub.id,
    paymentId: payment.id,
    invoiceNumber,
    planName: plan.name,
    amountKobo: charge.amountKobo,
    status: "paid",
    periodStart,
    periodEnd,
  });

  try {
    const pdfUrl = await generateInvoicePdf({
      invoiceNumber,
      planName: plan.name,
      amountKobo: charge.amountKobo,
      issuedAt: invoice.issuedAt,
      periodStart,
      periodEnd,
      accountId: account.id,
      accountName: account.fullName,
      accountEmail: account.email,
      cardBrand: auth.brand ?? auth.card_type ?? null,
      cardLast4: auth.last4 ?? null,
    });
    await updateInvoice(invoice.id, { pdfUrl });
  } catch (err: any) {
    console.error("[membership] invoice PDF generation failed:", err?.message);
  }

  await dispatchNotification({
    recipientAccountId: account.id,
    type: isRenewal ? "subscription_renewed" : "subscription_activated",
    payload: { planName: plan.name, periodEnd: periodEnd.toISOString(), invoiceNumber },
    emailable: true,
  });
};

// ---- public logic (HTTP) ----

export const _getMembership = async (account: any): Promise<Response> => {
  return response({ error: false, message: "Membership retrieved", data: await buildView(account) });
};

export const _getPlans = async (account: any): Promise<Response> => {
  const sub = await getSubscriptionByAccount(account.id);
  const plans = await getPlansForRole(account.role);
  return response({
    error: false,
    message: "Plans retrieved",
    data: { items: plans.map((p) => toPlanView(p, sub?.planId)) },
  });
};

// Resolves the Paystack redirect target. The client may send its own callbackUrl
// (so localhost / preview deploys redirect back to themselves instead of the
// FRONTEND_URL deployment), but only to an allowed origin — a client-controlled
// redirect at the end of a real payment is an open-redirect/phishing vector
// otherwise. Localhost is always allowed for dev.
const resolveCallbackUrl = (raw?: string): URL => {
  // Base form resolves cleanly whether FRONTEND_URL has a trailing slash or not.
  if (!raw) return new URL("/membership/callback", env.frontendUrl);
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

// `context` tags where the checkout was started ("onboarding" during registration,
// anything else/absent = dashboard). It is round-tripped onto the Paystack callback
// redirect as ?context=... so the frontend callback page knows where to send the
// user afterwards — back into the onboarding wizard or back to the dashboard.
export const _subscribe = async (
  account: any,
  context?: string,
  callbackUrl?: string
): Promise<Response> => {
  if (account.membershipTier === "professional") {
    const sub = await getSubscriptionByAccount(account.id);
    if (sub && (sub.status === "active" || sub.status === "non_renewing")) {
      throw conflict("You already have an active professional membership");
    }
  }
  const code = professionalPlanCodeForRole(account.role);
  if (!code) throw badRequest("Professional membership is only available to lawyers and firms");

  const plan = await getPlanByCode(code);
  if (!plan) throw notFound("Plan not found");
  if (!plan.paystackPlanCode) {
    throw serviceUnavailable("This plan is not yet configured on Paystack. Contact support.");
  }

  const redirect = resolveCallbackUrl(callbackUrl);
  if (context === "onboarding") redirect.searchParams.set("context", "onboarding");

  const init = await paystack.initializeTransaction({
    email: account.email,
    amountKobo: plan.priceKobo,
    planCode: plan.paystackPlanCode,
    callbackUrl: redirect.toString(),
    metadata: { accountId: account.id, planId: plan.id, context: context ?? "dashboard" },
  });

  return response({
    error: false,
    message: "Checkout initialized",
    data: {
      authorizationUrl: init.authorization_url,
      reference: init.reference,
      accessCode: init.access_code,
      plan: toPlanView(plan),
    },
  });
};

export const _verifyPayment = async (account: any, reference: string): Promise<Response> => {
  if (!reference) throw badRequest("reference is required");
  const data = await paystack.verifyTransaction(reference);
  if (data?.status !== "success") {
    throw badRequest("Payment was not successful");
  }

  const planId = data?.metadata?.planId;
  let plan = planId ? await getPlanById(planId) : null;
  if (!plan) {
    const code = professionalPlanCodeForRole(account.role);
    plan = code ? await getPlanByCode(code) : null;
  }
  if (!plan) throw notFound("Plan not found");

  await activateFromCharge(account, plan, {
    reference: data.reference,
    amountKobo: data.amount,
    channel: data.channel ?? null,
    authorization: data.authorization,
    customerCode: data.customer?.customer_code ?? null,
  });

  const fresh = (await findAccountById(account.id)) ?? account;
  return response({ error: false, message: "Payment verified", data: await buildView(fresh) });
};

export const _setAutoRenew = async (account: any, autoRenew: boolean): Promise<Response> => {
  const sub = await getSubscriptionByAccount(account.id);
  if (!sub) throw badRequest("You do not have an active subscription");
  if (!sub.paystackSubscriptionCode || !sub.paystackEmailToken) {
    throw serviceUnavailable("Subscription is still being set up. Please try again shortly.");
  }

  if (autoRenew) {
    await paystack.enableSubscription(sub.paystackSubscriptionCode, sub.paystackEmailToken);
    await updateSubscription(sub.id, { status: "active", autoRenew: true });
  } else {
    await paystack.disableSubscription(sub.paystackSubscriptionCode, sub.paystackEmailToken);
    await updateSubscription(sub.id, { status: "non_renewing", autoRenew: false });
  }

  const fresh = (await findAccountById(account.id)) ?? account;
  return response({
    error: false,
    message: autoRenew ? "Auto-renewal enabled" : "Auto-renewal disabled",
    data: await buildView(fresh),
  });
};

export const _cancelRenewal = async (account: any): Promise<Response> => {
  const result = await _setAutoRenew(account, false);
  return response({
    error: false,
    message: "Renewal cancelled. Your membership stays active until the end of the current period.",
    data: result.data,
  });
};

export const _updatePaymentMethod = async (account: any): Promise<Response> => {
  const sub = await getSubscriptionByAccount(account.id);
  if (!sub?.paystackSubscriptionCode) {
    throw serviceUnavailable("No active subscription to update a card for.");
  }
  const { link } = await paystack.generateManageLink(sub.paystackSubscriptionCode);
  await dispatchNotification({
    recipientAccountId: account.id,
    type: "payment_method_updated",
    payload: { action: "update_link_generated" },
  });
  return response({ error: false, message: "Card update link generated", data: { link } });
};

export const _listInvoices = async (
  accountId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { items, total } = await listInvoicesByAccount(accountId, skip, take);
  return response({
    error: false,
    message: "Invoices retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

export const _getInvoiceDownload = async (
  accountId: string,
  invoiceId: string
): Promise<Response> => {
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) throw notFound("Invoice not found");
  if (invoice.accountId !== accountId) throw forbidden("You do not own this invoice");
  if (!invoice.pdfUrl) throw notFound("Invoice PDF is not ready yet");
  return response({ error: false, message: "Invoice download link", data: { url: invoice.pdfUrl } });
};

// ---- webhook event handling ----

export const handlePaystackEvent = async (event: string, data: any): Promise<void> => {
  switch (event) {
    case "charge.success": {
      // Event-promotion charges are one-off (not subscriptions) — route them to the
      // promotion activation and stop before the membership-activation path.
      if (data?.metadata?.kind === "event_promotion" && data?.metadata?.serviceRequestId) {
        await activatePromotionFromCharge({
          serviceRequestId: data.metadata.serviceRequestId,
          reference: data.reference,
          amountKobo: data.amount,
          channel: data.channel ?? null,
          paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
        });
        return;
      }
      // Resolve the account: metadata first (initial checkout), email fallback (auto-renew charges).
      let account: any = data?.metadata?.accountId ? await findAccountById(data.metadata.accountId) : null;
      if (!account && data?.customer?.email) {
        account = await findAccountByEmail(data.customer.email);
      }
      if (!account) {
        console.warn("[webhook] charge.success: account not resolved", data?.reference);
        return;
      }
      // Resolve the plan: metadata first, then the account's current subscription, then role default.
      let plan = data?.metadata?.planId ? await getPlanById(data.metadata.planId) : null;
      if (!plan) {
        const sub = await getSubscriptionByAccount(account.id);
        plan = sub?.plan ?? null;
      }
      if (!plan) {
        const code = professionalPlanCodeForRole(account.role);
        plan = code ? await getPlanByCode(code) : null;
      }
      if (!plan) {
        console.warn("[webhook] charge.success: plan not resolved for", account.id);
        return;
      }
      await activateFromCharge(account, plan, {
        reference: data.reference,
        amountKobo: data.amount,
        channel: data.channel ?? null,
        authorization: data.authorization,
        customerCode: data.customer?.customer_code ?? null,
      });
      return;
    }

    case "subscription.create": {
      // Links the Paystack subscription to our row (code + email token used to enable/disable).
      const email = data?.customer?.email;
      const account = email ? await findAccountByEmail(email) : null;
      if (!account) return;
      let plan = data?.plan?.plan_code ? await getPlanByPaystackCode(data.plan.plan_code) : null;
      if (!plan) {
        const sub = await getSubscriptionByAccount(account.id);
        plan = sub?.plan ?? null;
      }
      if (!plan) return;
      const nextPayment = data?.next_payment_date ? new Date(data.next_payment_date) : undefined;
      await upsertSubscription(account.id, {
        planId: plan.id,
        status: "active",
        autoRenew: true,
        paystackSubscriptionCode: data.subscription_code,
        paystackEmailToken: data.email_token,
        paystackCustomerCode: data?.customer?.customer_code ?? undefined,
        currentPeriodEnd: nextPayment,
      });
      return;
    }

    case "invoice.payment_failed": {
      const code = data?.subscription?.subscription_code;
      const sub = code ? await findSubscriptionByPaystackCode(code) : null;
      if (!sub) return;
      await updateSubscription(sub.id, { status: "past_due" });
      await dispatchNotification({
        recipientAccountId: sub.accountId,
        type: "payment_failed",
        payload: { subscriptionCode: code },
        emailable: true,
      });
      return;
    }

    case "subscription.disable":
    case "subscription.not_renew": {
      const code = data?.subscription_code;
      const sub = code ? await findSubscriptionByPaystackCode(code) : null;
      if (!sub) return;
      await updateSubscription(sub.id, { status: "non_renewing", autoRenew: false });
      return;
    }

    default:
      return;
  }
};
