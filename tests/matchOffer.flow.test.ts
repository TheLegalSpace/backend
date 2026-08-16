import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MATCH_COOLDOWN_MS,
  OFFERS_PER_AREA_PER_WINDOW,
  OFFER_VALID_MS,
} from "../src/config/matchmaking";

const practiceAreaFindUnique = vi.fn();
const findPinnedOfferBatch = vi.fn();
const countOfferBatchesInWindow = vi.fn();
const createOfferBatch = vi.fn();
const nextRollAvailableAt = vi.fn();
const selectOfferCandidates = vi.fn();

vi.mock("../src/config/database", () => ({
  prisma: { practiceArea: { findUnique: (...a: any[]) => practiceAreaFindUnique(...a) } },
}));
vi.mock("../src/config/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../src/dao/analytics", () => ({ logSearch: vi.fn() }));
vi.mock("../src/dao/matchOffer", () => ({
  findPinnedOfferBatch: (...a: any[]) => findPinnedOfferBatch(...a),
  countOfferBatchesInWindow: (...a: any[]) => countOfferBatchesInWindow(...a),
  createOfferBatch: (...a: any[]) => createOfferBatch(...a),
  nextRollAvailableAt: (...a: any[]) => nextRollAvailableAt(...a),
}));
vi.mock("../src/services/matchmaking", () => ({
  selectOfferCandidates: (...a: any[]) => selectOfferCandidates(...a),
}));

const { _searchMatches, _matchAvailability } = await import("../src/logic/matchmaking");

const AREA = "11111111-1111-1111-1111-111111111111";
const USER = "user-1";
const NOW = new Date("2026-08-15T12:00:00Z");

const intake: any = {
  matter: AREA,
  budget: "100k_to_500k",
  location: "Lagos",
  preference: "either",
};

const offerRow = (over: any = {}) => ({
  id: over.id ?? "offer-1",
  batchId: over.batchId ?? "batch-1",
  practiceAreaId: AREA,
  offeredRole: "LAWYER",
  score: 80,
  matchedFactors: ["practice_area"],
  budgetRelaxed: false,
  createdAt: over.createdAt ?? new Date(NOW.getTime() - 60 * 60 * 1000),
  expiresAt: new Date(NOW.getTime() + OFFER_VALID_MS),
  offeredAccount: {
    id: over.accountId ?? "lawyer-1",
    role: "LAWYER",
    fullName: "A Lawyer",
    isAnonymous: false,
    email: "a@b.com",
  },
  ...over,
});

beforeEach(() => {
  practiceAreaFindUnique.mockReset().mockResolvedValue({ id: AREA, isActive: true });
  findPinnedOfferBatch.mockReset().mockResolvedValue(null);
  countOfferBatchesInWindow.mockReset().mockResolvedValue(0);
  createOfferBatch.mockReset();
  nextRollAvailableAt.mockReset().mockResolvedValue(null);
  selectOfferCandidates.mockReset();
});

describe("_searchMatches — fees are never client-facing", () => {
  // Product decision: a client is matched inside their budget, but is never shown
  // the figure — not even for the lawyer they were matched with. If this ever
  // regresses, the whole matching funnel is decorative.
  const pricedRow = (over: any = {}) =>
    offerRow({
      ...over,
      offeredAccount: {
        id: over.accountId ?? "lawyer-1",
        role: "LAWYER",
        fullName: "A Lawyer",
        isAnonymous: false,
        email: "a@b.com",
        lawyerProfile: { scn: "SCN1", feeRangeMin: 5_000_000, feeRangeMax: 50_000_000 },
        practiceAreaLinks: [{ practiceAreaId: AREA, feeMin: 5_000_000, feeMax: 20_000_000 }],
      },
    });

  it("strips fees from a freshly drawn match", async () => {
    selectOfferCandidates.mockResolvedValue({
      picks: [{ account: { id: "lawyer-1", role: "LAWYER" }, score: 80, matchedFactors: [] }],
      budgetRelaxed: false,
      eligibleCount: 4,
    });
    createOfferBatch.mockResolvedValue([pricedRow()]);

    const res = await _searchMatches(intake, USER, 1, 20, { now: NOW });
    const account = res.data.items[0].account;

    expect(account.lawyerProfile.feeRangeMin).toBeUndefined();
    expect(account.lawyerProfile.feeRangeMax).toBeUndefined();
    expect(account.practiceAreaLinks[0].feeMin).toBeUndefined();
    // Everything else still travels.
    expect(account.lawyerProfile.scn).toBe("SCN1");
    expect(account.fullName).toBe("A Lawyer");
  });

  it("strips fees from a replayed pinned match too", async () => {
    findPinnedOfferBatch.mockResolvedValue([pricedRow()]);

    const res = await _searchMatches(intake, USER, 1, 20, { now: NOW });

    expect(res.data.offer.pinned).toBe(true);
    expect(res.data.items[0].account.lawyerProfile.feeRangeMin).toBeUndefined();
  });

  it("still tells the client when the match is above their budget", async () => {
    // The affordability signal has to survive even though the number does not —
    // the client cannot read the fee for themselves.
    selectOfferCandidates.mockResolvedValue({
      picks: [{ account: { id: "lawyer-1", role: "LAWYER" }, score: 60, matchedFactors: [] }],
      budgetRelaxed: true,
      eligibleCount: 1,
    });
    createOfferBatch.mockResolvedValue([pricedRow({ budgetRelaxed: true })]);

    const res = await _searchMatches(intake, USER, 1, 20, { now: NOW });

    expect(res.data.offer.budgetRelaxed).toBe(true);
    expect(res.data.items[0].account.lawyerProfile.feeRangeMin).toBeUndefined();
  });
});

describe("_searchMatches — match, don't browse", () => {
  it("returns at most one lawyer and one firm", async () => {
    selectOfferCandidates.mockResolvedValue({
      picks: [
        { account: { id: "lawyer-1", role: "LAWYER" }, score: 80, matchedFactors: [] },
        { account: { id: "firm-1", role: "FIRM" }, score: 75, matchedFactors: [] },
      ],
      budgetRelaxed: false,
      eligibleCount: 12,
    });
    createOfferBatch.mockResolvedValue([
      offerRow({ id: "o1", accountId: "lawyer-1" }),
      offerRow({ id: "o2", accountId: "firm-1", offeredRole: "FIRM" }),
    ]);

    const res = await _searchMatches(intake, USER, 1, 20, { now: NOW });

    expect(res.data.items).toHaveLength(2);
    // Never the whole roster, no matter how many were eligible.
    expect(res.data.pagination.total).toBe(2);
    expect(res.data.offer.pinned).toBe(false);
  });

  it("persists the drawn batch so it can be replayed and gated on", async () => {
    selectOfferCandidates.mockResolvedValue({
      picks: [{ account: { id: "lawyer-1", role: "LAWYER" }, score: 80, matchedFactors: ["x"] }],
      budgetRelaxed: false,
      eligibleCount: 3,
    });
    createOfferBatch.mockResolvedValue([offerRow()]);

    await _searchMatches(intake, USER, 1, 20, { now: NOW });

    const arg = createOfferBatch.mock.calls[0][0];
    expect(arg.userAccountId).toBe(USER);
    expect(arg.practiceAreaId).toBe(AREA);
    expect(arg.rows).toEqual([
      { offeredAccountId: "lawyer-1", offeredRole: "LAWYER", score: 80, matchedFactors: ["x"] },
    ]);
    expect(arg.expiresAt.getTime()).toBe(NOW.getTime() + OFFER_VALID_MS);
  });

  it("replays the pinned offer instead of redrawing inside the cooldown", async () => {
    // The heart of it: re-running the same intake must not roll again, or a client
    // enumerates the roster (and its pricing) by repeating the search.
    const created = new Date(NOW.getTime() - 60 * 60 * 1000);
    findPinnedOfferBatch.mockResolvedValue([offerRow({ createdAt: created })]);

    const res = await _searchMatches(intake, USER, 1, 20, { now: NOW });

    expect(selectOfferCandidates).not.toHaveBeenCalled();
    expect(createOfferBatch).not.toHaveBeenCalled();
    expect(res.data.offer.pinned).toBe(true);
    expect(res.data.offer.cooldownUntil.getTime()).toBe(created.getTime() + MATCH_COOLDOWN_MS);
  });

  it("refuses a fresh draw once the per-area allowance is spent", async () => {
    countOfferBatchesInWindow.mockResolvedValue(OFFERS_PER_AREA_PER_WINDOW);
    await expect(_searchMatches(intake, USER, 1, 20, { now: NOW })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(selectOfferCandidates).not.toHaveBeenCalled();
  });

  it("still replays a pinned offer when the allowance is spent", async () => {
    // Being out of allowance must not strand a client who already has a live match.
    countOfferBatchesInWindow.mockResolvedValue(OFFERS_PER_AREA_PER_WINDOW);
    findPinnedOfferBatch.mockResolvedValue([offerRow()]);
    const res = await _searchMatches(intake, USER, 1, 20, { now: NOW });
    expect(res.data.offer.pinned).toBe(true);
  });

  it("rejects an unknown or inactive practice area", async () => {
    practiceAreaFindUnique.mockResolvedValue(null);
    await expect(_searchMatches(intake, USER, 1, 20, { now: NOW })).rejects.toMatchObject({
      statusCode: 400,
    });

    practiceAreaFindUnique.mockResolvedValue({ id: AREA, isActive: false });
    await expect(_searchMatches(intake, USER, 1, 20, { now: NOW })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("404s rather than returning an empty match when nobody is eligible", async () => {
    selectOfferCandidates.mockResolvedValue({ picks: [], budgetRelaxed: false, eligibleCount: 0 });
    await expect(_searchMatches(intake, USER, 1, 20, { now: NOW })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(createOfferBatch).not.toHaveBeenCalled();
  });

  it("surfaces budgetRelaxed so the client is told plainly", async () => {
    selectOfferCandidates.mockResolvedValue({
      picks: [{ account: { id: "lawyer-1", role: "LAWYER" }, score: 60, matchedFactors: [] }],
      budgetRelaxed: true,
      eligibleCount: 1,
    });
    createOfferBatch.mockResolvedValue([offerRow({ budgetRelaxed: true })]);
    const res = await _searchMatches(intake, USER, 1, 20, { now: NOW });
    expect(res.data.offer.budgetRelaxed).toBe(true);
  });
});

describe("_matchAvailability", () => {
  it("reports availability when there is no cooldown and allowance remains", async () => {
    const res = await _matchAvailability(USER, AREA, NOW);
    expect(res.data.available).toBe(true);
    expect(res.data.onCooldown).toBe(false);
    expect(res.data.quotaExhausted).toBe(false);
  });

  it("reports the cooldown and hours remaining", async () => {
    const until = new Date(NOW.getTime() + 5 * 60 * 60 * 1000);
    nextRollAvailableAt.mockResolvedValue(until);
    const res = await _matchAvailability(USER, AREA, NOW);
    expect(res.data.available).toBe(false);
    expect(res.data.onCooldown).toBe(true);
    expect(res.data.hoursRemaining).toBe(5);
    expect(res.data.cooldownUntil).toEqual(until);
  });

  it("reports an exhausted allowance", async () => {
    countOfferBatchesInWindow.mockResolvedValue(OFFERS_PER_AREA_PER_WINDOW);
    const res = await _matchAvailability(USER, AREA, NOW);
    expect(res.data.quotaExhausted).toBe(true);
    expect(res.data.available).toBe(false);
  });
});
