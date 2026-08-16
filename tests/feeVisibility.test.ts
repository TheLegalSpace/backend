import { describe, it, expect } from "vitest";
import {
  redactFees,
  canSeeFees,
  applyFeeVisibility,
  applyFeeVisibilityAll,
} from "../src/services/feeVisibility";

const lawyer = () => ({
  id: "lawyer-1",
  role: "LAWYER",
  fullName: "A Lawyer",
  lawyerProfile: {
    scn: "SCN1",
    callToBarYear: 2015,
    feeRangeMin: 5_000_000,
    feeRangeMax: 50_000_000,
    verificationStatus: "verified",
  },
  practiceAreaLinks: [
    { practiceAreaId: "area-1", feeMin: 5_000_000, feeMax: 20_000_000 },
  ],
  practiceAreas: [
    { id: "area-1", name: "Tenancy Law", minFee: 5_000_000, maxFee: 20_000_000 },
  ],
});

describe("redactFees", () => {
  it("strips fees from every shape they travel in", () => {
    const out: any = redactFees(lawyer());
    expect(out.lawyerProfile.feeRangeMin).toBeUndefined();
    expect(out.lawyerProfile.feeRangeMax).toBeUndefined();
    expect(out.practiceAreaLinks[0].feeMin).toBeUndefined();
    expect(out.practiceAreaLinks[0].feeMax).toBeUndefined();
    expect(out.practiceAreas[0].minFee).toBeUndefined();
    expect(out.practiceAreas[0].maxFee).toBeUndefined();
  });

  it("leaves the rest of the profile intact", () => {
    const out: any = redactFees(lawyer());
    expect(out.fullName).toBe("A Lawyer");
    expect(out.lawyerProfile.scn).toBe("SCN1");
    expect(out.lawyerProfile.verificationStatus).toBe("verified");
    expect(out.practiceAreas[0].name).toBe("Tenancy Law");
    expect(out.practiceAreaLinks[0].practiceAreaId).toBe("area-1");
  });

  it("does not mutate the input", () => {
    const original = lawyer();
    redactFees(original);
    expect(original.lawyerProfile.feeRangeMin).toBe(5_000_000);
    expect(original.practiceAreaLinks[0].feeMin).toBe(5_000_000);
    expect(original.practiceAreas[0].minFee).toBe(5_000_000);
  });

  it("handles firm profiles", () => {
    const firm: any = redactFees({
      id: "f",
      firmProfile: { firmName: "X LP", feeRangeMin: 1, feeRangeMax: 2 },
    });
    expect(firm.firmProfile.firmName).toBe("X LP");
    expect(firm.firmProfile.feeRangeMin).toBeUndefined();
    expect(firm.firmProfile.feeRangeMax).toBeUndefined();
  });

  it("survives accounts with no fee-bearing fields", () => {
    expect(() => redactFees({ id: "bare" } as any)).not.toThrow();
    expect(redactFees(null as any)).toBeNull();
  });
});

// Product decision: clients never see fees. Only the account itself and admins do.
describe("canSeeFees", () => {
  it("lets an account see its own fees", () => {
    expect(canSeeFees("lawyer-1", "LAWYER", "lawyer-1")).toBe(true);
  });

  it("lets admins see fees", () => {
    expect(canSeeFees("admin-1", "ADMIN", "lawyer-1")).toBe(true);
  });

  it("denies a client viewing a lawyer", () => {
    expect(canSeeFees("user-1", "USER", "lawyer-1")).toBe(false);
  });

  it("denies a client who has been matched with the lawyer", () => {
    // Being matched does not unlock fees — the price is not client-facing at all.
    expect(canSeeFees("matched-user", "USER", "lawyer-1")).toBe(false);
  });

  it("denies a lawyer viewing a competitor", () => {
    expect(canSeeFees("lawyer-2", "LAWYER", "lawyer-1")).toBe(false);
  });

  it("denies an unauthenticated viewer", () => {
    expect(canSeeFees(null, null, "lawyer-1")).toBe(false);
    expect(canSeeFees(undefined, undefined, "lawyer-1")).toBe(false);
  });
});

describe("applyFeeVisibility", () => {
  it("redacts for a client", () => {
    const out: any = applyFeeVisibility(lawyer(), "user-1", "USER");
    expect(out.lawyerProfile.feeRangeMin).toBeUndefined();
    expect(out.practiceAreas[0].minFee).toBeUndefined();
  });

  it("passes fees through to the owner", () => {
    const out: any = applyFeeVisibility(lawyer(), "lawyer-1", "LAWYER");
    expect(out.lawyerProfile.feeRangeMin).toBe(5_000_000);
    expect(out.practiceAreas[0].minFee).toBe(5_000_000);
  });

  it("passes fees through to an admin", () => {
    const out: any = applyFeeVisibility(lawyer(), "admin-1", "ADMIN");
    expect(out.lawyerProfile.feeRangeMax).toBe(50_000_000);
  });

  it("applies per row over an array", () => {
    const out: any[] = applyFeeVisibilityAll(
      [lawyer(), { ...lawyer(), id: "lawyer-2" }],
      "lawyer-1",
      "LAWYER"
    );
    // Own row keeps fees, the competitor's row does not.
    expect(out[0].lawyerProfile.feeRangeMin).toBe(5_000_000);
    expect(out[1].lawyerProfile.feeRangeMin).toBeUndefined();
  });
});
