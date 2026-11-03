import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Refunds and chargebacks. There is no wallet, so money goes back by hand — what
 * the system owes is an accurate record of it, and a person told when a payment
 * is disputed or refunded behind its back.
 */

const findServiceRequestById = vi.fn();
const findPromotionByPaymentReference = vi.fn();
const srUpdate = vi.fn();
const eventUpdate = vi.fn();
const dispatchNotification = vi.fn();
const findActiveAdminIds = vi.fn();

vi.mock("../src/config/database", () => ({
  prisma: {
    $transaction: async (fn: any) =>
      fn({
        serviceRequest: { update: (...a: any[]) => srUpdate(...a) },
        event: { update: (...a: any[]) => eventUpdate(...a) },
      }),
  },
}));
vi.mock("../src/dao/service", () => ({
  createServiceRequest: vi.fn(),
  findServiceRequestById: (...a: any[]) => findServiceRequestById(...a),
  findPromotionByPaymentReference: (...a: any[]) => findPromotionByPaymentReference(...a),
  listServiceRequestsByAccount: vi.fn(),
  updateServiceRequest: vi.fn(),
}));
vi.mock("../src/dao/admin", () => ({
  findActiveAdminIds: (...a: any[]) => findActiveAdminIds(...a),
}));
vi.mock("../src/services/notification", () => ({
  dispatchNotification: (...a: any[]) => dispatchNotification(...a),
}));
vi.mock("../src/services/storage", () => ({ uploadToR2: vi.fn(), MAX_AVATAR_BYTES: 1 }));
vi.mock("../src/services/paystack", () => ({}));
vi.mock("../src/services/invoice", () => ({ generateInvoicePdf: vi.fn() }));
vi.mock("../src/middleware/auth", () => ({ invalidateAccountCache: vi.fn() }));
vi.mock("../src/dao/account", () => ({}));
vi.mock("../src/dao/membership", () => ({}));
vi.mock("../src/logic/credits", () => ({ activateCreditPurchase: vi.fn() }));

const { markPromotionRefunded, activatePromotionFromCharge } = await import("../src/logic/service");
const { handlePaystackEvent } = await import("../src/logic/membership");

const paidPromotion = (over: any = {}) => ({
  id: "sr-1",
  type: "event_promotion",
  accountId: "organiser-1",
  paymentStatus: "paid",
  eventId: "ev-1",
  event: { id: "ev-1", status: "published", title: "Law Week" },
  payload: { payment: { reference: "pay-ref" } },
  ...over,
});

beforeEach(() => {
  findServiceRequestById.mockReset().mockResolvedValue(paidPromotion());
  findPromotionByPaymentReference.mockReset().mockResolvedValue(null);
  srUpdate.mockReset();
  eventUpdate.mockReset();
  dispatchNotification.mockReset();
  findActiveAdminIds.mockReset().mockResolvedValue(["admin-1", "admin-2"]);
});

describe("recording a promotion refund", () => {
  it("marks it refunded, keeps the record, and tells the organiser", async () => {
    const { changed } = await markPromotionRefunded({
      serviceRequestId: "sr-1",
      source: "manual",
      note: "Bank transfer via support",
      adminId: "admin-1",
    });
    expect(changed).toBe(true);
    const data = srUpdate.mock.calls[0][0].data;
    expect(data.paymentStatus).toBe("refunded");
    expect(data.payload.payment.reference).toBe("pay-ref"); // original charge kept
    expect(data.payload.refund).toMatchObject({ source: "manual", byAdminId: "admin-1" });
    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientAccountId: "organiser-1",
        payload: expect.objectContaining({ kind: "event_promotion_refunded" }),
      })
    );
  });

  it("takes down a promotion that is still live — it is no longer paid for", async () => {
    await markPromotionRefunded({ serviceRequestId: "sr-1", source: "manual" });
    expect(eventUpdate).toHaveBeenCalledWith({ where: { id: "ev-1" }, data: { status: "rejected" } });
  });

  it("leaves an event that already ended alone", async () => {
    findServiceRequestById.mockResolvedValue(paidPromotion({ event: { status: "past" } }));
    await markPromotionRefunded({ serviceRequestId: "sr-1", source: "manual" });
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent — a second record changes nothing and notifies nobody", async () => {
    findServiceRequestById.mockResolvedValue(paidPromotion({ paymentStatus: "refunded" }));
    const { changed } = await markPromotionRefunded({ serviceRequestId: "sr-1", source: "paystack" });
    expect(changed).toBe(false);
    expect(srUpdate).not.toHaveBeenCalled();
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  it("refuses to refund a promotion nobody paid for", async () => {
    findServiceRequestById.mockResolvedValue(paidPromotion({ paymentStatus: "pending" }));
    await expect(
      markPromotionRefunded({ serviceRequestId: "sr-1", source: "manual" })
    ).rejects.toThrow(/paid/);
  });

  it("is not undone when reconciliation replays the original charge", async () => {
    findServiceRequestById.mockResolvedValue(paidPromotion({ paymentStatus: "refunded" }));
    await activatePromotionFromCharge({ serviceRequestId: "sr-1", reference: "pay-ref", amountKobo: 1 });
    expect(srUpdate).not.toHaveBeenCalled();
  });
});

describe("Paystack refund and dispute events", () => {
  it("closes the loop on its own for a promotion refunded in the dashboard", async () => {
    findPromotionByPaymentReference.mockResolvedValue({ id: "sr-1" });
    await handlePaystackEvent("refund.processed", { transaction_reference: "pay-ref" });
    expect(srUpdate.mock.calls[0][0].data.payload.refund.source).toBe("paystack");
  });

  it("tells the admins about any other refund — access and balances are a judgement call", async () => {
    await handlePaystackEvent("refund.processed", { transaction_reference: "membership-ref" });
    expect(srUpdate).not.toHaveBeenCalled();
    expect(dispatchNotification).toHaveBeenCalledTimes(2);
    expect(dispatchNotification.mock.calls[0][0].payload).toMatchObject({
      kind: "payment_refunded_external",
      reference: "membership-ref",
    });
  });

  it("alerts every admin to a chargeback", async () => {
    await handlePaystackEvent("charge.dispute.create", {
      transaction: { reference: "pay-ref", amount: 1200000 },
      category: "fraud",
      due_at: "2026-11-05T00:00:00Z",
    });
    const recipients = dispatchNotification.mock.calls.map((c) => c[0].recipientAccountId);
    expect(recipients).toEqual(["admin-1", "admin-2"]);
    expect(dispatchNotification.mock.calls[0][0].payload).toMatchObject({
      kind: "payment_dispute_opened",
      reference: "pay-ref",
      reason: "fraud",
    });
  });
});
