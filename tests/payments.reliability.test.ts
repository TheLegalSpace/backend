import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

/**
 * Payment reliability: the ways a customer can pay and get nothing, or be
 * refunded with no record of it. None of these show up on the happy path — a
 * webhook that swallows its own failure looks identical to one that succeeded.
 */

const handlePaystackEvent = vi.fn();
const verifyWebhookSignature = vi.fn();
const listTransactions = vi.fn();

vi.mock("../src/logic/membership", () => ({
  handlePaystackEvent: (...a: any[]) => handlePaystackEvent(...a),
}));
vi.mock("../src/services/paystack", () => ({
  verifyWebhookSignature: (...a: any[]) => verifyWebhookSignature(...a),
  listTransactions: (...a: any[]) => listTransactions(...a),
}));

const { default: webhookRoutes } = await import("../src/routes/webhooks");
const { reconcilePayments } = await import("../src/jobs/paymentReconciliation");

const buildApp = async () => {
  const app = Fastify();
  await app.register(webhookRoutes, { prefix: "/webhooks" });
  await app.ready();
  return app;
};

const deliver = (app: any) =>
  app.inject({
    method: "POST",
    url: "/webhooks/paystack",
    headers: { "content-type": "application/json", "x-paystack-signature": "sig" },
    payload: JSON.stringify({ event: "charge.success", data: { reference: "ref-1" } }),
  });

beforeEach(() => {
  handlePaystackEvent.mockReset().mockResolvedValue(undefined);
  verifyWebhookSignature.mockReset().mockReturnValue(true);
  listTransactions.mockReset();
});

describe("Paystack webhook — a failure must be retried, not acknowledged", () => {
  it("answers 500 when the handler fails, so Paystack redelivers", async () => {
    handlePaystackEvent.mockRejectedValueOnce(new Error("db unavailable"));
    const res = await deliver(await buildApp());
    expect(res.statusCode).toBe(500);
  });

  it("acknowledges a handled event", async () => {
    const res = await deliver(await buildApp());
    expect(res.statusCode).toBe(200);
    expect(handlePaystackEvent).toHaveBeenCalledWith("charge.success", { reference: "ref-1" });
  });

  it("rejects an unsigned delivery without running anything", async () => {
    verifyWebhookSignature.mockReturnValue(false);
    const res = await deliver(await buildApp());
    expect(res.statusCode).toBe(401);
    expect(handlePaystackEvent).not.toHaveBeenCalled();
  });
});

describe("payment reconciliation — the backstop when the webhook never lands", () => {
  const NOW = new Date("2026-11-03T12:00:00Z");

  it("replays recent successful charges through the webhook handler", async () => {
    listTransactions.mockResolvedValueOnce([
      { reference: "a", metadata: { kind: "membership" } },
      { reference: "b", metadata: null },
    ]);
    const checked = await reconcilePayments(NOW);
    expect(checked).toBe(2);
    expect(handlePaystackEvent).toHaveBeenCalledWith(
      "charge.success",
      expect.objectContaining({ reference: "a" })
    );
  });

  it("leaves the newest charges to the webhook instead of racing it", async () => {
    listTransactions.mockResolvedValueOnce([]);
    await reconcilePayments(NOW);
    const { to, from } = listTransactions.mock.calls[0][0];
    expect(NOW.getTime() - to.getTime()).toBe(15 * 60 * 1000);
    expect(NOW.getTime() - from.getTime()).toBe(48 * 60 * 60 * 1000);
  });

  it("parses metadata that came back as a JSON string — routing depends on it", async () => {
    listTransactions.mockResolvedValueOnce([
      { reference: "p", metadata: JSON.stringify({ kind: "event_promotion", serviceRequestId: "sr-1" }) },
    ]);
    await reconcilePayments(NOW);
    expect(handlePaystackEvent.mock.calls[0][1].metadata).toEqual({
      kind: "event_promotion",
      serviceRequestId: "sr-1",
    });
  });

  it("keeps going past a charge that fails", async () => {
    handlePaystackEvent.mockRejectedValueOnce(new Error("boom"));
    listTransactions.mockResolvedValueOnce([{ reference: "x" }, { reference: "y" }]);
    const checked = await reconcilePayments(NOW);
    expect(handlePaystackEvent).toHaveBeenCalledTimes(2);
    expect(checked).toBe(1);
  });

  it("pages until a short page", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ reference: `r${i}` }));
    listTransactions.mockResolvedValueOnce(full).mockResolvedValueOnce([{ reference: "last" }]);
    const checked = await reconcilePayments(NOW);
    expect(listTransactions).toHaveBeenCalledTimes(2);
    expect(checked).toBe(101);
  });
});
