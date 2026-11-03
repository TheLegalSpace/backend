import cron from "node-cron";
import { env } from "../config/env";
import { listTransactions } from "../services/paystack";
import { handlePaystackEvent } from "../logic/membership";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// Look back two days so a charge whose webhook failed overnight is still caught,
// and skip the newest charges so the webhook — the normal path — gets there first
// rather than racing this job for the same reference.
const LOOKBACK_MS = 48 * HOUR_MS;
const SETTLE_MS = 15 * MINUTE_MS;
const PER_PAGE = 100;
const MAX_PAGES = 20;

/**
 * Replays recent successful Paystack charges through the webhook handler.
 *
 * The webhook is how a payment becomes a membership, a promotion or a credit
 * top-up. If it never arrives, or fails on every retry, the customer has paid
 * and received nothing — and the /verify fallback only runs if they come back to
 * the page. Every activation is idempotent on the payment reference, so
 * replaying a charge that was already applied does nothing; one that was missed
 * gets applied.
 */
export const reconcilePayments = async (now = new Date()): Promise<number> => {
  const from = new Date(now.getTime() - LOOKBACK_MS);
  const to = new Date(now.getTime() - SETTLE_MS);
  let checked = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const transactions = await listTransactions({
      status: "success",
      from,
      to,
      page,
      perPage: PER_PAGE,
    });
    for (const tx of transactions) {
      // Metadata comes back as a JSON string when it was sent as one.
      if (typeof tx.metadata === "string") {
        try {
          tx.metadata = JSON.parse(tx.metadata);
        } catch {
          tx.metadata = null;
        }
      }
      try {
        await handlePaystackEvent("charge.success", tx);
        checked++;
      } catch (err: any) {
        console.error(`[cron] payment reconciliation failed reference=${tx.reference}:`, err?.message);
      }
    }
    if (transactions.length < PER_PAGE) break;
  }
  return checked;
};

// Hourly at :20.
export const startPaymentReconciliationJob = () => {
  if (!env.paystackSecretKey) return;
  cron.schedule("20 * * * *", async () => {
    try {
      const checked = await reconcilePayments();
      console.log(`[cron] payment reconciliation: checked ${checked} successful charges`);
    } catch (err: any) {
      console.error("[cron] payment reconciliation failed:", err?.message);
    }
  });
};
