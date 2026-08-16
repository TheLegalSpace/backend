import { describe, it, expect } from "vitest";
import {
  scoreAccount,
  selectionBand,
  pickWeighted,
  applyRotation,
  budgetToMaxKobo,
  feeMinForMatter,
} from "../src/services/matchmaking";
import { IntakePayload } from "../src/interface";

const AREA = "11111111-1111-1111-1111-111111111111";
const OTHER_AREA = "22222222-2222-2222-2222-222222222222";

const intake = (over: Partial<IntakePayload> = {}): IntakePayload => ({
  matter: AREA,
  budget: "100k_to_500k",
  location: "Lagos",
  preference: "either",
  ...over,
});

const account = (over: any = {}) => ({
  id: over.id ?? "acc-1",
  role: "LAWYER",
  locationCity: "Lagos",
  locationCountry: "Nigeria",
  avgRating: 0,
  reviewCount: 0,
  // Deliberately stale so the recency bonus is 0 and the arithmetic below is only
  // about the factors under test. Recency has its own case.
  lastActiveAt: new Date("2025-01-01T00:00:00Z"),
  practiceAreaLinks: [{ practiceAreaId: AREA, feeMin: 1_000_000, feeMax: 5_000_000 }],
  lawyerProfile: { feeRangeMin: 1_000_000, feeRangeMax: 5_000_000 },
  firmProfile: null,
  ...over,
});

const NOW = new Date("2026-01-02T00:00:00Z").getTime();

describe("budgetToMaxKobo", () => {
  it("maps each band to its ceiling in kobo", () => {
    expect(budgetToMaxKobo("under_100k")).toBe(10_000_000);
    expect(budgetToMaxKobo("100k_to_500k")).toBe(50_000_000);
    expect(budgetToMaxKobo("500k_to_2m")).toBe(200_000_000);
    expect(budgetToMaxKobo("above_2m")).toBe(999_999_999_999);
  });
});

describe("feeMinForMatter", () => {
  it("prefers the requested area's own fee over the profile rollup", () => {
    const acc = account({
      practiceAreaLinks: [
        { practiceAreaId: AREA, feeMin: 7_000_000, feeMax: 9_000_000 },
        { practiceAreaId: OTHER_AREA, feeMin: 1_000_000, feeMax: 2_000_000 },
      ],
      lawyerProfile: { feeRangeMin: 1_000_000, feeRangeMax: 9_000_000 },
    });
    expect(feeMinForMatter(acc, AREA)).toBe(7_000_000);
  });

  it("falls back to the rollup when the account doesn't carry the area", () => {
    const acc = account({
      practiceAreaLinks: [{ practiceAreaId: OTHER_AREA, feeMin: 3_000_000, feeMax: 4_000_000 }],
      lawyerProfile: { feeRangeMin: 3_000_000, feeRangeMax: 4_000_000 },
    });
    expect(feeMinForMatter(acc, AREA)).toBe(3_000_000);
  });
});

describe("scoreAccount", () => {
  it("awards practice area, city, fee and preference on a full match", () => {
    const { matchedFactors, raw } = scoreAccount(account(), intake(), "Nigeria", NOW);
    expect(matchedFactors).toContain("practice_area");
    expect(matchedFactors).toContain("location");
    expect(matchedFactors).toContain("fee_range");
    expect(matchedFactors).toContain("preference");
    // 40 practice + 20 city + 15 fee + 10 preference = 85
    expect(raw).toBe(85);
  });

  it("drops to the country bonus when the city differs", () => {
    const { matchedFactors, raw } = scoreAccount(
      account({ locationCity: "Abuja" }),
      intake(),
      "Nigeria",
      NOW
    );
    expect(matchedFactors).toContain("country");
    expect(matchedFactors).not.toContain("location");
    expect(raw).toBe(75);
  });

  it("withholds the fee bonus when the area's fee is over budget", () => {
    const acc = account({
      practiceAreaLinks: [{ practiceAreaId: AREA, feeMin: 90_000_000, feeMax: 120_000_000 }],
    });
    const { matchedFactors, raw } = scoreAccount(acc, intake(), "Nigeria", NOW);
    expect(matchedFactors).not.toContain("fee_range");
    expect(raw).toBe(70);
  });

  it("withholds the preference bonus when the role doesn't match", () => {
    const { matchedFactors } = scoreAccount(
      account({ role: "FIRM" }),
      intake({ preference: "lawyer" }),
      "Nigeria",
      NOW
    );
    expect(matchedFactors).not.toContain("preference");
  });

  it("adds a recency bonus for an account active in the last 7 days", () => {
    const stale = scoreAccount(account(), intake(), "Nigeria", NOW).raw;
    const active = scoreAccount(
      account({ lastActiveAt: new Date(NOW - 24 * 60 * 60 * 1000) }),
      intake(),
      "Nigeria",
      NOW
    ).raw;
    expect(active - stale).toBe(5);
  });

  it("adds rating and review weight", () => {
    const base = scoreAccount(account(), intake(), "Nigeria", NOW).raw;
    const rated = scoreAccount(
      account({ avgRating: 4.5, reviewCount: 80 }),
      intake(),
      "Nigeria",
      NOW
    ).raw;
    // rating 4.5*2 = 9, reviews capped at 50 * 0.1 = 5
    expect(rated - base).toBeCloseTo(14, 5);
  });

  it("normalises to 0-100", () => {
    const { score } = scoreAccount(account(), intake(), "Nigeria", NOW);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("selectionBand", () => {
  const c = (score: number, id = `a${score}`) => ({ score, account: { id } });

  it("keeps everyone within the band of the leader", () => {
    const band = selectionBand([c(90), c(85), c(80), c(60), c(50)], 15, 1);
    expect(band.map((b) => b.score)).toEqual([90, 85, 80]);
  });

  it("widens to the minimum pool when the band is too tight", () => {
    const band = selectionBand([c(90), c(50), c(40), c(30)], 5, 3);
    expect(band).toHaveLength(3);
    expect(band.map((b) => b.score)).toEqual([90, 50, 40]);
  });

  it("never invents candidates in a thin pool", () => {
    expect(selectionBand([c(90), c(80)], 5, 5)).toHaveLength(2);
    expect(selectionBand([], 15, 5)).toHaveLength(0);
  });
});

describe("pickWeighted", () => {
  const pool = [
    { score: 90, account: { id: "high" } },
    { score: 80, account: { id: "mid" } },
    { score: 70, account: { id: "low" } },
  ];

  it("can return any candidate in the band, not just the top scorer", () => {
    // This is the ticket's point: a deterministic 'best match always wins' pick is
    // what lets a client infer the pricing table by repeating a search.
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const pick = pickWeighted(pool, Math.random);
      if (pick) seen.add(pick.account.id);
    }
    expect(seen).toEqual(new Set(["high", "mid", "low"]));
  });

  it("maps the random ticket across the weighted ranges", () => {
    // weights 90 / 80 / 70, total 240
    expect(pickWeighted(pool, () => 0)?.account.id).toBe("high");
    expect(pickWeighted(pool, () => 89 / 240)?.account.id).toBe("high");
    expect(pickWeighted(pool, () => 91 / 240)?.account.id).toBe("mid");
    expect(pickWeighted(pool, () => 0.99)?.account.id).toBe("low");
  });

  it("favours higher scores on average", () => {
    let high = 0;
    for (let i = 0; i < 3000; i++) {
      if (pickWeighted(pool, Math.random)?.account.id === "high") high++;
    }
    // Expected share is 90/240 = 37.5%; allow generous slack for randomness.
    expect(high / 3000).toBeGreaterThan(0.28);
    expect(high / 3000).toBeLessThan(0.48);
  });

  it("handles a single candidate and an empty pool", () => {
    expect(pickWeighted([pool[0]])?.account.id).toBe("high");
    expect(pickWeighted([])).toBeNull();
  });

  it("can still reach a zero-scoring candidate", () => {
    const zeroes = [
      { score: 0, account: { id: "a" } },
      { score: 0, account: { id: "b" } },
    ];
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = pickWeighted(zeroes, Math.random);
      if (p) seen.add(p.account.id);
    }
    expect(seen.size).toBe(2);
  });
});

describe("applyRotation", () => {
  const c = (id: string, score = 80) => ({ score, account: { id } });

  it("holds back candidates already shown to this user", () => {
    const scored = [c("seen"), c("fresh")];
    const { pool, rotated } = applyRotation(scored, new Map([["seen", NOW]]));
    expect(rotated).toBe(true);
    expect(pool.map((p) => p.account.id)).toEqual(["fresh"]);
  });

  it("falls back to least-recently-shown rather than returning nothing", () => {
    // A thin roster must never produce an empty 'Get a Lawyer' result — a repeat
    // is a better outcome than a dead end.
    const scored = [c("recent"), c("stale")];
    const shown = new Map([
      ["recent", NOW],
      ["stale", NOW - 10 * 24 * 60 * 60 * 1000],
    ]);
    const { pool, rotated } = applyRotation(scored, shown);
    expect(rotated).toBe(false);
    expect(pool).toHaveLength(2);
    expect(pool[0].account.id).toBe("stale");
  });

  it("treats an empty history as all-fresh", () => {
    const { pool, rotated } = applyRotation([c("a"), c("b")], new Map());
    expect(rotated).toBe(true);
    expect(pool).toHaveLength(2);
  });
});
