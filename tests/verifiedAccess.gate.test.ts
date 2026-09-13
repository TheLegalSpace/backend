import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireVerifiedAccess } from "../src/middleware/requireVerifiedAccess";
import { FINAL_STATUSES } from "../src/config/verification";

/**
 * The platform wall. These hold two lines that are easy to break by accident and
 * expensive to break in production: an unverified LAWYER reaches nothing, and the
 * wall never catches anyone it wasn't aimed at.
 */

const makeReply = () => {
  const reply: any = {
    statusCode: null,
    body: null,
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(payload: any) {
      reply.body = payload;
      return reply;
    },
  };
  return reply;
};

const lawyer = (verificationStatus: string | null, profile: any = {}) => ({
  id: "acc-1",
  role: "LAWYER",
  membershipTier: "community",
  profileCompletedAt: null,
  lawyerProfile:
    verificationStatus === null
      ? null
      : {
          verificationStatus,
          scn: "SCN/2020/00001",
          identityCheckStatus: "matched",
          ...profile,
        },
});

describe("requireVerifiedAccess — who is stopped", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s when no account is loaded", async () => {
    const reply = makeReply();
    await requireVerifiedAccess({ account: undefined } as any, reply);
    expect(reply.statusCode).toBe(401);
  });

  for (const status of ["pending", "under_review", "disputed", "rejected"]) {
    it(`403s a lawyer at ${status}`, async () => {
      const reply = makeReply();
      await requireVerifiedAccess({ account: lawyer(status) } as any, reply);
      expect(reply.statusCode).toBe(403);
      expect(reply.body.error).toBe(true);
      expect(reply.body.data.verificationBlocked).toBe(true);
      expect(reply.body.data.verificationStatus).toBe(status);
    });
  }

  it("treats a lawyer with no satellite as the start of the wizard, not a pass", async () => {
    // The satellite is created at the bar-details step, so its absence is an
    // *earlier* state than `pending` — it must not fall through the gate.
    const reply = makeReply();
    await requireVerifiedAccess({ account: lawyer(null) } as any, reply);
    expect(reply.statusCode).toBe(403);
    expect(reply.body.data.verificationStatus).toBe("pending");
  });

  it("carries the wizard's nextStep so the client knows which screen to show", async () => {
    const reply = makeReply();
    await requireVerifiedAccess(
      { account: lawyer("under_review", { applicationSubmittedAt: new Date() }) } as any,
      reply
    );
    expect(reply.body.data.onboarding.nextStep).toBe("await_review");
  });

  it("hands a rejected lawyer the reason, since they cannot read it in-app", async () => {
    const reply = makeReply();
    await requireVerifiedAccess(
      {
        account: lawyer("rejected", {
          applicationSubmittedAt: new Date(),
          verificationFlags: { rejectionReason: "Certificate is unreadable" },
        }),
      } as any,
      reply
    );
    expect(reply.body.data.onboarding.rejectionReason).toBe("Certificate is unreadable");
  });
});

describe("requireVerifiedAccess — who is let through", () => {
  it("passes a verified lawyer", async () => {
    const reply = makeReply();
    await requireVerifiedAccess({ account: lawyer("verified") } as any, reply);
    expect(reply.statusCode).toBeNull();
  });

  for (const role of ["USER", "ADMIN", "PENDING_PROFESSIONAL"]) {
    it(`passes ${role} untouched — verification does not apply to them`, async () => {
      const reply = makeReply();
      await requireVerifiedAccess({ account: { id: "a", role } } as any, reply);
      expect(reply.statusCode).toBeNull();
    });
  }

  it("passes an unverified FIRM — the firm wizard pays before review, so it is not gated yet", async () => {
    const reply = makeReply();
    await requireVerifiedAccess(
      {
        account: {
          id: "f",
          role: "FIRM",
          firmProfile: { verificationStatus: "under_review" },
        },
      } as any,
      reply
    );
    expect(reply.statusCode).toBeNull();
  });
});

describe("rejection is retryable", () => {
  it("only `verified` closes a verification step", () => {
    // The retry design rests on this. If `rejected` ever rejoins this list,
    // document upload, the NIN check and resubmission all silently become dead
    // ends again.
    expect(FINAL_STATUSES).toEqual(["verified"]);
    expect(FINAL_STATUSES).not.toContain("rejected");
  });
});
