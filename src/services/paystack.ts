import crypto from "crypto";
import { env } from "../config/env";
import { serviceUnavailable } from "../helpers/utility";

// Thin wrapper over the Paystack REST API. All amounts are in kobo.
// Bearer auth uses the secret key; the same secret key signs webhooks (HMAC SHA512).

const request = async <T = any>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, any>
): Promise<T> => {
  if (!env.paystackSecretKey) {
    throw serviceUnavailable("Paystack is not configured (missing PAYSTACK_SECRET_KEY)");
  }
  let res: Response;
  try {
    res = await fetch(`${env.paystackBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err: any) {
    throw serviceUnavailable(`Paystack request failed: ${err?.message || "network error"}`);
  }

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.status === false) {
    const detail = json?.message || `${res.status} ${res.statusText}`;
    throw serviceUnavailable(`Paystack error: ${detail}`);
  }
  return json.data as T;
};

export const createOrGetCustomer = async (input: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<{ customer_code: string }> => {
  return request("POST", "/customer", {
    email: input.email,
    first_name: input.firstName ?? undefined,
    last_name: input.lastName ?? undefined,
  });
};

export const initializeTransaction = async (input: {
  email: string;
  amountKobo: number;
  planCode?: string; // Paystack plan code — passing it auto-creates a subscription on first charge
  callbackUrl?: string;
  metadata?: Record<string, any>;
}): Promise<{ authorization_url: string; access_code: string; reference: string }> => {
  return request("POST", "/transaction/initialize", {
    email: input.email,
    amount: input.amountKobo,
    plan: input.planCode || undefined,
    callback_url: input.callbackUrl || undefined,
    metadata: input.metadata || undefined,
  });
};

export const verifyTransaction = async (reference: string): Promise<any> => {
  return request("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
};

export const getSubscription = async (code: string): Promise<any> => {
  return request("GET", `/subscription/${encodeURIComponent(code)}`);
};

// Disable = "non-renewing": the subscription stays active until the period ends, then stops.
export const disableSubscription = async (code: string, emailToken: string): Promise<any> => {
  return request("POST", "/subscription/disable", { code, token: emailToken });
};

export const enableSubscription = async (code: string, emailToken: string): Promise<any> => {
  return request("POST", "/subscription/enable", { code, token: emailToken });
};

// Hosted link the user opens to update the card on a subscription.
export const generateManageLink = async (code: string): Promise<{ link: string }> => {
  return request("GET", `/subscription/${encodeURIComponent(code)}/manage/link`);
};

// Read a plan back so we can confirm Paystack will charge what we advertise.
export const getPlan = async (
  code: string
): Promise<{ plan_code: string; amount: number; interval: string; name: string }> => {
  return request("GET", `/plan/${encodeURIComponent(code)}`);
};

// One-off — used by a seed/admin script to create the Paystack Plan and capture its plan_code.
export const createPlan = async (input: {
  name: string;
  amountKobo: number;
  intervalMonths: number;
}): Promise<{ plan_code: string }> => {
  // We sell exactly two terms and Paystack has a native interval for each.
  // Anything else is a bug upstream — fail loudly rather than quietly billing
  // someone yearly because their term didn't match the 6-month branch.
  const interval =
    input.intervalMonths === 6
      ? "biannually"
      : input.intervalMonths === 12
      ? "annually"
      : null;
  if (!interval) {
    throw serviceUnavailable(
      `Unsupported billing interval: ${input.intervalMonths} months. Plans are 6 or 12 months.`
    );
  }
  return request("POST", "/plan", {
    name: input.name,
    amount: input.amountKobo,
    interval,
  });
};

// HMAC SHA512 of the raw request body, keyed by the secret key, compared to x-paystack-signature.
export const verifyWebhookSignature = (rawBody: Buffer | string, signature?: string): boolean => {
  if (!signature || !env.paystackSecretKey) return false;
  const hash = crypto
    .createHmac("sha512", env.paystackSecretKey)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
};
