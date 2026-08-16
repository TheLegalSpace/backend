import { describe, it, expect, vi, beforeEach } from "vitest";
import { OFFERS_PER_AREA_PER_WINDOW } from "../src/config/matchmaking";

const accountFindUnique = vi.fn();
const practiceAreaFindUnique = vi.fn();
const requestFindFirst = vi.fn();

const findActionableOffer = vi.fn();
const attachRequestToOffer = vi.fn();
const releaseBatchIfSettled = vi.fn();
const countConsumingRequestsInWindow = vi.fn();
const createRequest = vi.fn();
const findRequestById = vi.fn();
const declineRequest = vi.fn();
const cancelRequest = vi.fn();

vi.mock("../src/config/database", () => ({
  prisma: {
    account: { findUnique: (...a: any[]) => accountFindUnique(...a) },
    practiceArea: { findUnique: (...a: any[]) => practiceAreaFindUnique(...a) },
    request: { findFirst: (...a: any[]) => requestFindFirst(...a) },
  },
}));
vi.mock("../src/dao/matchOffer", () => ({
  findActionableOffer: (...a: any[]) => findActionableOffer(...a),
  attachRequestToOffer: (...a: any[]) => attachRequestToOffer(...a),
  releaseBatchIfSettled: (...a: any[]) => releaseBatchIfSettled(...a),
}));
vi.mock("../src/dao/request", () => ({
  createRequest: (...a: any[]) => createRequest(...a),
  findRequestById: (...a: any[]) => findRequestById(...a),
  listRequests: vi.fn(),
  listLeads: vi.fn(),
  cancelRequest: (...a: any[]) => cancelRequest(...a),
  declineRequest: (...a: any[]) => declineRequest(...a),
  countConsumingRequestsInWindow: (...a: any[]) => countConsumingRequestsInWindow(...a),
}));
vi.mock("../src/services/matchmaking", () => ({ computeRelevanceScore: vi.fn(async () => 80) }));
vi.mock("../src/services/notification", () => ({ dispatchNotification: vi.fn() }));
vi.mock("../src/realtime/emitter", () => ({ emitToAccount: vi.fn() }));

const { _createRequest, _declineLead, _cancelRequest } = await import("../src/logic/request");

const AREA = "11111111-1111-1111-1111-111111111111";
const USER = "user-1";
const LAWYER = "lawyer-1";
const NOW = new Date("2026-08-15T12:00:00Z");

const body = { lawyerAccountId: LAWYER, intakePayload: { matter: AREA, budget: "100k_to_500k" } };

const eligibleLawyer = {
  id: LAWYER,
  role: "LAWYER",
  status: "active",
  membershipTier: "professional",
  lawyerProfile: { verificationStatus: "verified" },
  firmProfile: null,
};

beforeEach(() => {
  accountFindUnique.mockReset().mockResolvedValue(eligibleLawyer);
  practiceAreaFindUnique.mockReset().mockResolvedValue({ id: AREA });
  requestFindFirst.mockReset().mockResolvedValue(null);
  findActionableOffer.mockReset().mockResolvedValue({
    id: "offer-1",
    practiceAreaId: AREA,
    batchId: "batch-1",
  });
  attachRequestToOffer.mockReset().mockResolvedValue({});
  releaseBatchIfSettled.mockReset().mockResolvedValue(1);
  countConsumingRequestsInWindow.mockReset().mockResolvedValue(0);
  createRequest.mockReset().mockResolvedValue({
    id: "req-1",
    userAccountId: USER,
    lawyerAccountId: LAWYER,
    intakePayload: body.intakePayload,
  });
  findRequestById.mockReset();
  declineRequest.mockReset().mockResolvedValue({ id: "req-1", status: "declined" });
  cancelRequest.mockReset().mockResolvedValue({ id: "req-1", status: "expired" });
});

describe("_createRequest — you can only request who you were matched with", () => {
  it("creates the request when a live offer backs it", async () => {
    const res = await _createRequest(USER, body, NOW);
    expect(res.error).toBe(false);
    expect(createRequest).toHaveBeenCalledWith(
      expect.objectContaining({ userAccountId: USER, lawyerAccountId: LAWYER, practiceAreaId: AREA })
    );
  });

  it("refuses a lawyer the client was never offered", async () => {
    // Closes the back door: finding a lawyer by name search and requesting them
    // directly would otherwise bypass cooldown, rotation and quota entirely.
    findActionableOffer.mockResolvedValue(null);
    await expect(_createRequest(USER, body, NOW)).rejects.toMatchObject({ statusCode: 403 });
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("refuses when the offer was for a different practice area", async () => {
    findActionableOffer.mockResolvedValue({
      id: "offer-1",
      practiceAreaId: "99999999-9999-9999-9999-999999999999",
      batchId: "b",
    });
    await expect(_createRequest(USER, body, NOW)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("requires a practice area on the intake", async () => {
    await expect(
      _createRequest(USER, { lawyerAccountId: LAWYER, intakePayload: {} }, NOW)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects an unknown practice area", async () => {
    practiceAreaFindUnique.mockResolvedValue(null);
    await expect(_createRequest(USER, body, NOW)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("enforces the per-area request allowance", async () => {
    countConsumingRequestsInWindow.mockResolvedValue(OFFERS_PER_AREA_PER_WINDOW);
    await expect(_createRequest(USER, body, NOW)).rejects.toMatchObject({ statusCode: 400 });
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("spends the offer so it cannot back a second request", async () => {
    await _createRequest(USER, body, NOW);
    expect(attachRequestToOffer).toHaveBeenCalledWith("offer-1", "req-1");
  });

  it("does not fail the request if spending the offer errors", async () => {
    attachRequestToOffer.mockRejectedValue(new Error("db blip"));
    const res = await _createRequest(USER, body, NOW);
    expect(res.error).toBe(false);
  });

  it("still rejects a self-request, an unverified or community lawyer", async () => {
    await expect(
      _createRequest(USER, { ...body, lawyerAccountId: USER }, NOW)
    ).rejects.toMatchObject({ statusCode: 400 });

    accountFindUnique.mockResolvedValue({
      ...eligibleLawyer,
      lawyerProfile: { verificationStatus: "pending" },
    });
    await expect(_createRequest(USER, body, NOW)).rejects.toMatchObject({ statusCode: 400 });

    accountFindUnique.mockResolvedValue({ ...eligibleLawyer, membershipTier: "community" });
    await expect(_createRequest(USER, body, NOW)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("still rejects a duplicate pending request to the same lawyer", async () => {
    requestFindFirst.mockResolvedValue({ id: "existing" });
    await expect(_createRequest(USER, body, NOW)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("offer release", () => {
  it("gives the slot back when the lawyer declines", async () => {
    findRequestById.mockResolvedValue({
      id: "req-1",
      lawyerAccountId: LAWYER,
      userAccountId: USER,
      status: "pending",
      intakePayload: body.intakePayload,
    });
    await _declineLead("req-1", LAWYER, "too busy");
    expect(releaseBatchIfSettled).toHaveBeenCalledWith("req-1");
  });

  it("does NOT give the slot back when the client cancels", async () => {
    // Otherwise request-then-cancel is a free reroll around the cooldown.
    findRequestById.mockResolvedValue({
      id: "req-1",
      userAccountId: USER,
      lawyerAccountId: LAWYER,
      status: "pending",
    });
    await _cancelRequest("req-1", USER);
    expect(cancelRequest).toHaveBeenCalledWith("req-1");
    expect(releaseBatchIfSettled).not.toHaveBeenCalled();
  });
});
