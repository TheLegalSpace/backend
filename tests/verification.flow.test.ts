import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MAX_IDENTITY_CHECK_ATTEMPTS,
  INITIAL_VERIFICATION_STATUS,
  UNDER_REVIEW_STATUS,
  DISPUTED_STATUS,
  formatDisputeCaseReference,
} from "../src/config/verification";

const accountUpdate = vi.fn();
const lawyerProfileUpdateMany = vi.fn();
const transaction = vi.fn(async (fn: any) =>
  fn({ lawyerProfile: { updateMany: (...a: any[]) => lawyerProfileUpdateMany(...a) } })
);

const findAccountById = vi.fn();
const findLawyerProfileByAccount = vi.fn();
const findLawyerProfileByScn = vi.fn();
const createLawyerProfileForVerification = vi.fn();
const updateLawyerProfileByAccount = vi.fn();
const consumeIdentityAttempt = vi.fn();
const findSatelliteProfile = vi.fn();
const updateSatelliteProfile = vi.fn();
const listVerificationDocuments = vi.fn();
const createVerificationDocument = vi.fn();
const findDisputeByClaimantAndScn = vi.fn();
const findDisputeById = vi.fn();
const findLatestDisputeForClaimant = vi.fn();
const countDisputesInYear = vi.fn();
const createDispute = vi.fn();
const resolveDisputeDao = vi.fn();

const checkNbaRecord = vi.fn();
const checkNin = vi.fn();
const dispatchNotification = vi.fn();

vi.mock("../src/config/database", () => ({
  prisma: {
    account: { update: (...a: any[]) => accountUpdate(...a) },
    lawyerProfile: { updateMany: (...a: any[]) => lawyerProfileUpdateMany(...a) },
    $transaction: (fn: any) => transaction(fn),
  },
}));
vi.mock("../src/dao/account", () => ({ findAccountById: (...a: any[]) => findAccountById(...a) }));
vi.mock("../src/dao/verification", () => ({
  findLawyerProfileByAccount: (...a: any[]) => findLawyerProfileByAccount(...a),
  findLawyerProfileByScn: (...a: any[]) => findLawyerProfileByScn(...a),
  createLawyerProfileForVerification: (...a: any[]) => createLawyerProfileForVerification(...a),
  updateLawyerProfileByAccount: (...a: any[]) => updateLawyerProfileByAccount(...a),
  consumeIdentityAttempt: (...a: any[]) => consumeIdentityAttempt(...a),
  findSatelliteProfile: (...a: any[]) => findSatelliteProfile(...a),
  updateSatelliteProfile: (...a: any[]) => updateSatelliteProfile(...a),
  listVerificationDocuments: (...a: any[]) => listVerificationDocuments(...a),
  createVerificationDocument: (...a: any[]) => createVerificationDocument(...a),
  findDisputeByClaimantAndScn: (...a: any[]) => findDisputeByClaimantAndScn(...a),
  findDisputeById: (...a: any[]) => findDisputeById(...a),
  findLatestDisputeForClaimant: (...a: any[]) => findLatestDisputeForClaimant(...a),
  countDisputesInYear: (...a: any[]) => countDisputesInYear(...a),
  createDispute: (...a: any[]) => createDispute(...a),
  listOpenDisputes: vi.fn(),
  resolveDispute: (...a: any[]) => resolveDisputeDao(...a),
}));
vi.mock("../src/services/identityVerification", async () => {
  const actual: any = await vi.importActual("../src/services/identityVerification");
  return {
    ...actual,
    checkNbaRecord: (...a: any[]) => checkNbaRecord(...a),
    checkNin: (...a: any[]) => checkNin(...a),
  };
});
vi.mock("../src/services/notification", () => ({
  dispatchNotification: (...a: any[]) => dispatchNotification(...a),
}));
vi.mock("../src/services/storage", () => ({
  uploadToR2: vi.fn(async () => ({ key: "disputes/DSP-2026-0001/evidence.pdf" })),
  MAX_ARTICLE_ASSET_BYTES: 25 * 1024 * 1024,
}));
vi.mock("../src/dao/admin", () => ({ recordAuditLog: vi.fn() }));
vi.mock("../src/middleware/auth", () => ({ invalidateAccountCache: vi.fn() }));

import {
  _submitBarDetails,
  _raiseScnDispute,
  _verifyIdentity,
  _submitApplication,
  _resolveScnDispute,
} from "../src/logic/verification";

const LAWYER = "lawyer-1";
const AUTH = "auth-1";
const OTHER = "lawyer-2";

const account = (over: any = {}) => ({
  id: LAWYER,
  authUserId: AUTH,
  role: "LAWYER",
  status: "active",
  fullName: "Oluwaseun Ezekiel Marian",
  email: "seun@example.com",
  membershipTier: "community",
  lawyerProfile: null,
  firmProfile: null,
  ...over,
});

const profile = (over: any = {}) => ({
  accountId: LAWYER,
  scn: "SCN/2016/04821",
  barFullName: "Oluwaseun Ezekiel Marian",
  callToBarYear: 2019,
  verificationStatus: INITIAL_VERIFICATION_STATUS,
  identityCheckStatus: null,
  identityCheckAttempts: 0,
  verificationFlags: {},
  applicationSubmittedAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  checkNbaRecord.mockResolvedValue({ status: "unchecked", reference: null, detail: "manual" });
  checkNin.mockResolvedValue({ status: "unchecked", reference: null, detail: "manual" });
  findAccountById.mockResolvedValue(account());
  findLawyerProfileByAccount.mockResolvedValue(null);
  findLawyerProfileByScn.mockResolvedValue(null);
  createLawyerProfileForVerification.mockImplementation(async (d: any) => profile(d));
  updateLawyerProfileByAccount.mockImplementation(async (_id: string, d: any) => profile(d));
  consumeIdentityAttempt.mockImplementation(async () => profile({ identityCheckAttempts: 1 }));
  listVerificationDocuments.mockResolvedValue([{ docType: "call_to_bar_cert" }]);
  findSatelliteProfile.mockImplementation(async () => findLawyerProfileByAccount());
  updateSatelliteProfile.mockImplementation(async (_id: string, _role: string, d: any) => profile(d));
});

describe("bar details — the SCN claim", () => {
  it("checks SCN availability before spending a paid NBA lookup", async () => {
    findLawyerProfileByScn.mockResolvedValue({
      accountId: OTHER,
      scn: "SCN/2016/04821",
      verificationFlags: {},
      account: {
        fullName: "Ada Chukwu",
        email: "ada@gmail.com",
        status: "active",
        lawyerProfile: { verificationStatus: "verified" },
      },
    });

    const res = await _submitBarDetails(LAWYER, AUTH, {
      fullName: "Oluwaseun Ezekiel Marian",
      scn: "SCN/2016/04821",
      callToBarYear: 2019,
    });

    expect(res.data.outcome).toBe("already_registered");
    // The whole point of the ordering: a duplicate must not cost a lookup.
    expect(checkNbaRecord).not.toHaveBeenCalled();
    expect(createLawyerProfileForVerification).not.toHaveBeenCalled();
  });

  it("masks the existing holder rather than handing over their identity", async () => {
    findLawyerProfileByScn.mockResolvedValue({
      accountId: OTHER,
      scn: "SCN/2016/04821",
      verificationFlags: {},
      account: {
        fullName: "Ada Chukwu",
        email: "ada@gmail.com",
        status: "active",
        lawyerProfile: { verificationStatus: "verified" },
      },
    });

    const res = await _submitBarDetails(LAWYER, AUTH, {
      fullName: "Oluwaseun Ezekiel Marian",
      scn: "SCN/2016/04821",
      callToBarYear: 2019,
    });

    const shown = res.data.existingAccount;
    expect(shown.fullName).not.toContain("Chukwu");
    expect(shown.fullName.startsWith("Ada")).toBe(true);
    expect(shown.email).not.toBe("ada@gmail.com");
    expect(shown.email.endsWith("@gmail.com")).toBe(true);
    expect(shown.statusLabel).toBe("Active Account");
  });

  it("creates the satellite with a pending status and never verified", async () => {
    const res = await _submitBarDetails(LAWYER, AUTH, {
      fullName: "Oluwaseun Ezekiel Marian",
      scn: "scn/2016/04821",
      callToBarYear: 2019,
      nbaBranch: "Lagos",
    });

    expect(res.data.outcome).toBe("unchecked");
    const created = createLawyerProfileForVerification.mock.calls[0][0];
    expect(created.verificationStatus).toBe(INITIAL_VERIFICATION_STATUS);
    expect(created.scn).toBe("SCN/2016/04821"); // normalised
  });

  it("reports a provider no_match without claiming the SCN", async () => {
    checkNbaRecord.mockResolvedValue({ status: "no_match", reference: "r1", detail: "no" });
    const res = await _submitBarDetails(LAWYER, AUTH, {
      fullName: "Oluwaseun Ezekiel Marian",
      scn: "SCN/2016/04821",
      callToBarYear: 2019,
    });
    expect(res.data.outcome).toBe("no_match");
    expect(createLawyerProfileForVerification).not.toHaveBeenCalled();
  });

  it("refuses to reopen a decision an admin already made", async () => {
    findLawyerProfileByAccount.mockResolvedValue(profile({ verificationStatus: "verified" }));
    await expect(
      _submitBarDetails(LAWYER, AUTH, {
        fullName: "Oluwaseun Ezekiel Marian",
        scn: "SCN/2016/04821",
        callToBarYear: 2019,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects a single-word name — the checks compare a full name", async () => {
    await expect(
      _submitBarDetails(LAWYER, AUTH, {
        fullName: "Oluwaseun",
        scn: "SCN/2016/04821",
        callToBarYear: 2019,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("SCN dispute — freeze without collateral damage", () => {
  const holder = {
    accountId: OTHER,
    scn: "SCN/2016/04821",
    verificationFlags: {},
    account: { fullName: "Ada Chukwu", email: "ada@gmail.com", status: "active" },
  };

  beforeEach(() => {
    findLawyerProfileByScn.mockResolvedValue(holder);
    findLawyerProfileByAccount.mockResolvedValue(profile());
    findDisputeByClaimantAndScn.mockResolvedValue(null);
    countDisputesInYear.mockResolvedValue(90);
    createDispute.mockImplementation(async (d: any) => ({
      ...d,
      id: "d1",
      status: "open",
      evidence: [],
      createdAt: new Date(),
    }));
  });

  it("never suspends the existing account", async () => {
    await _raiseScnDispute(LAWYER, AUTH, { scn: "SCN/2016/04821" });

    // A stranger clicking the red button must not be able to take a practising
    // lawyer offline. Account.status is untouched on both sides.
    expect(accountUpdate).not.toHaveBeenCalled();

    const holderUpdate = updateLawyerProfileByAccount.mock.calls.find((c) => c[0] === OTHER);
    expect(holderUpdate?.[1].verificationFlags.disputeOpen).toBe(true);
    expect(holderUpdate?.[1].verificationStatus).toBeUndefined();
  });

  it("makes the claimant unapprovable while the dispute is open", async () => {
    await _raiseScnDispute(LAWYER, AUTH, { scn: "SCN/2016/04821" });
    const own = updateLawyerProfileByAccount.mock.calls.find((c) => c[0] === LAWYER);
    expect(own?.[1].verificationStatus).toBe(DISPUTED_STATUS);
  });

  it("mints a quotable case reference", async () => {
    const res = await _raiseScnDispute(LAWYER, AUTH, { scn: "SCN/2016/04821" });
    const year = new Date().getFullYear();
    expect(res.data.dispute.caseReference).toBe(formatDisputeCaseReference(year, 91));
  });

  it("is idempotent — a second click reuses the case, not a new reference", async () => {
    findDisputeByClaimantAndScn.mockResolvedValue({
      id: "d1",
      caseReference: "DSP-2026-0091",
      scn: "SCN/2016/04821",
      status: "open",
      evidence: [],
    });
    const res = await _raiseScnDispute(LAWYER, AUTH, { scn: "SCN/2016/04821" });
    expect(res.data.alreadyFlagged).toBe(true);
    expect(createDispute).not.toHaveBeenCalled();
  });

  it("blocks submitting an application while disputed", async () => {
    findLawyerProfileByAccount.mockResolvedValue(
      profile({ verificationStatus: DISPUTED_STATUS })
    );
    await expect(_submitApplication(LAWYER, AUTH)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("releases the SCN before reassigning it when the claimant wins", async () => {
    findDisputeById.mockResolvedValue({
      id: "d1",
      status: "open",
      scn: "SCN/2016/04821",
      caseReference: "DSP-2026-0091",
      claimantAccountId: LAWYER,
      existingAccountId: OTHER,
      evidence: [],
    });
    findLawyerProfileByAccount.mockResolvedValue(
      profile({ accountId: OTHER, verificationFlags: { disputeOpen: true } })
    );
    resolveDisputeDao.mockResolvedValue({
      id: "d1",
      caseReference: "DSP-2026-0091",
      status: "resolved_claimant",
      evidence: [],
    });

    await _resolveScnDispute("admin-1", "d1", "resolved_claimant", "cert checks out");

    const calls = lawyerProfileUpdateMany.mock.calls;
    // The unique index means the release has to land before the reassignment.
    expect(calls[0][0].data.scn).toBeNull();
    expect(calls[1][0].data.scn).toBe("SCN/2016/04821");
    expect(calls[1][0].data.verificationStatus).toBe(UNDER_REVIEW_STATUS);
  });
});

describe("identity check — attempts are metered", () => {
  beforeEach(() => {
    findLawyerProfileByAccount.mockResolvedValue(profile());
  });

  it("rejects a malformed NIN before calling the paid provider", async () => {
    await expect(
      _verifyIdentity(LAWYER, AUTH, { nin: "123", consent: true })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(checkNin).not.toHaveBeenCalled();
  });

  it("requires consent before sending anything to the provider", async () => {
    await expect(
      _verifyIdentity(LAWYER, AUTH, { nin: "22102921031", consent: false })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(checkNin).not.toHaveBeenCalled();
  });

  it("does not spend an attempt when the provider could not be asked", async () => {
    checkNin.mockResolvedValue({ status: "unchecked", reference: null, detail: "off" });
    const res = await _verifyIdentity(LAWYER, AUTH, { nin: "22102921031", consent: true });
    expect(consumeIdentityAttempt).not.toHaveBeenCalled();
    expect(res.data.attemptsRemaining).toBe(MAX_IDENTITY_CHECK_ATTEMPTS);
  });

  it("spends an attempt on a real mismatch and counts down", async () => {
    checkNin.mockResolvedValue({ status: "no_match", reference: "r1", detail: "no" });
    const res = await _verifyIdentity(LAWYER, AUTH, { nin: "22102921031", consent: true });
    expect(consumeIdentityAttempt).toHaveBeenCalledOnce();
    expect(res.data.outcome).toBe("no_match");
    expect(res.data.attemptsRemaining).toBe(MAX_IDENTITY_CHECK_ATTEMPTS - 1);
    expect(res.data.flaggedForReview).toBe(false);
  });

  it("flags for review once the last attempt is spent", async () => {
    checkNin.mockResolvedValue({ status: "no_match", reference: "r1", detail: "no" });
    consumeIdentityAttempt.mockResolvedValue(
      profile({ identityCheckAttempts: MAX_IDENTITY_CHECK_ATTEMPTS })
    );
    findLawyerProfileByAccount.mockResolvedValue(
      profile({ identityCheckAttempts: MAX_IDENTITY_CHECK_ATTEMPTS - 1 })
    );

    const res = await _verifyIdentity(LAWYER, AUTH, { nin: "22102921031", consent: true });
    expect(res.data.attemptsRemaining).toBe(0);
    expect(res.data.flaggedForReview).toBe(true);
    const flagged = updateLawyerProfileByAccount.mock.calls.find(
      (c) => c[1]?.verificationFlags?.fraudReview
    );
    expect(flagged).toBeTruthy();
  });

  it("refuses further attempts once they are exhausted", async () => {
    findLawyerProfileByAccount.mockResolvedValue(
      profile({ identityCheckAttempts: MAX_IDENTITY_CHECK_ATTEMPTS, identityCheckStatus: "no_match" })
    );
    await expect(
      _verifyIdentity(LAWYER, AUTH, { nin: "22102921031", consent: true })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(checkNin).not.toHaveBeenCalled();
  });

  it("is idempotent once matched — no second paid lookup", async () => {
    findLawyerProfileByAccount.mockResolvedValue(profile({ identityCheckStatus: "matched" }));
    const res = await _verifyIdentity(LAWYER, AUTH, { nin: "22102921031", consent: true });
    expect(res.data.outcome).toBe("matched");
    expect(checkNin).not.toHaveBeenCalled();
  });
});

describe("submitting the application", () => {
  it("is the only thing that moves pending -> under_review", async () => {
    findLawyerProfileByAccount.mockResolvedValue(profile({ identityCheckStatus: "matched" }));
    const res = await _submitApplication(LAWYER, AUTH);
    expect(res.data.verificationStatus).toBe(UNDER_REVIEW_STATUS);
    const update = updateSatelliteProfile.mock.calls[0][2];
    expect(update.verificationStatus).toBe(UNDER_REVIEW_STATUS);
    expect(update.applicationSubmittedAt).toBeInstanceOf(Date);
  });

  it("blocks submission without the required document", async () => {
    findLawyerProfileByAccount.mockResolvedValue(profile({ identityCheckStatus: "matched" }));
    listVerificationDocuments.mockResolvedValue([]);
    await expect(_submitApplication(LAWYER, AUTH)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("blocks submission before the identity step has run", async () => {
    findLawyerProfileByAccount.mockResolvedValue(profile({ identityCheckStatus: null }));
    await expect(_submitApplication(LAWYER, AUTH)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("lets an unchecked identity through — that is the provider being off", async () => {
    findLawyerProfileByAccount.mockResolvedValue(profile({ identityCheckStatus: "unchecked" }));
    const res = await _submitApplication(LAWYER, AUTH);
    expect(res.data.submitted).toBe(true);
  });

  it("never writes verified — approval is an admin action", async () => {
    findLawyerProfileByAccount.mockResolvedValue(profile({ identityCheckStatus: "matched" }));
    await _submitApplication(LAWYER, AUTH);
    const statuses = [
      ...updateLawyerProfileByAccount.mock.calls.map((c) => c[1]?.verificationStatus),
      ...updateSatelliteProfile.mock.calls.map((c) => c[2]?.verificationStatus),
    ];
    expect(statuses).not.toContain("verified");
  });

  it("is idempotent while already under review", async () => {
    findLawyerProfileByAccount.mockResolvedValue(
      profile({ verificationStatus: UNDER_REVIEW_STATUS, identityCheckStatus: "matched" })
    );
    const res = await _submitApplication(LAWYER, AUTH);
    expect(res.data.submitted).toBe(false);
    expect(updateSatelliteProfile).not.toHaveBeenCalled();
  });
});

describe("firm path — the older wizard shape still reaches the queue", () => {
  // A firm's satellite is still created at setup, it has no bar-details or NIN
  // step, and `POST /profile/me/application` is its only route to under_review.
  // This existed as a regression once: the endpoint accepted FIRM at the role
  // check but then read the LawyerProfile, so no firm could ever submit.
  beforeEach(() => {
    findAccountById.mockResolvedValue(
      account({ role: "FIRM", firmProfile: { verificationStatus: INITIAL_VERIFICATION_STATUS } })
    );
    findSatelliteProfile.mockResolvedValue({
      accountId: LAWYER,
      verificationStatus: INITIAL_VERIFICATION_STATUS,
      verificationFlags: {},
      applicationSubmittedAt: null,
    });
    listVerificationDocuments.mockResolvedValue([{ docType: "cac_cert" }]);
  });

  it("submits without an identity check — the firm NIN flow does not exist yet", async () => {
    const res = await _submitApplication(LAWYER, AUTH);
    expect(res.data.verificationStatus).toBe(UNDER_REVIEW_STATUS);
    const [, role, data] = updateSatelliteProfile.mock.calls[0];
    expect(role).toBe("FIRM");
    expect(data.verificationStatus).toBe(UNDER_REVIEW_STATUS);
    expect(data.applicationSubmittedAt).toBeInstanceOf(Date);
  });

  it("still requires the CAC certificate", async () => {
    listVerificationDocuments.mockResolvedValue([]);
    await expect(_submitApplication(LAWYER, AUTH)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("asks a firm to finish its profile, not to submit bar details", async () => {
    findSatelliteProfile.mockResolvedValue(null);
    await expect(_submitApplication(LAWYER, AUTH)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("firm profile"),
    });
  });
});
