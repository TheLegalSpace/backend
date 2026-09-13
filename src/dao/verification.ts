import { prisma } from "../config/database";
import { OPEN_DISPUTE_STATUS, DISPUTE_CASE_PREFIX } from "../config/verification";

// Pure Prisma queries for the professional verification flow. No logic here.

export const findLawyerProfileByAccount = async (accountId: string) =>
  prisma.lawyerProfile.findUnique({ where: { accountId } });

/** Who currently holds this SCN. Used by the bar-details step before any paid
 *  lookup runs, so a duplicate never costs a provider call. */
export const findLawyerProfileByScn = async (scn: string) =>
  prisma.lawyerProfile.findUnique({
    where: { scn },
    include: { account: true },
  });

export const createLawyerProfileForVerification = async (data: {
  accountId: string;
  scn: string;
  barFullName: string;
  callToBarYear: number;
  nbaBranch?: string | null;
  verificationStatus: string;
  nbaCheckStatus: string;
  verificationFlags?: any;
}) =>
  prisma.lawyerProfile.create({
    data: {
      accountId: data.accountId,
      scn: data.scn,
      barFullName: data.barFullName,
      callToBarYear: data.callToBarYear,
      nbaBranch: data.nbaBranch ?? null,
      verificationStatus: data.verificationStatus,
      nbaCheckStatus: data.nbaCheckStatus,
      nbaCheckedAt: new Date(),
      ...(data.verificationFlags ? { verificationFlags: data.verificationFlags } : {}),
    },
  });

export const updateLawyerProfileByAccount = async (accountId: string, data: any) =>
  prisma.lawyerProfile.update({ where: { accountId }, data });

/** Atomic attempt increment. The counter cannot live in the client — each
 *  attempt is a paid lookup. */
export const consumeIdentityAttempt = async (accountId: string) =>
  prisma.lawyerProfile.update({
    where: { accountId },
    data: { identityCheckAttempts: { increment: 1 } },
  });

/** The verification-bearing satellite for either professional role.
 *  `verificationStatus` lives on LawyerProfile or FirmProfile, so anything that
 *  works for both roles has to reach it without knowing which. */
export const findSatelliteProfile = async (accountId: string, role: string) =>
  role === "FIRM"
    ? prisma.firmProfile.findUnique({ where: { accountId } })
    : prisma.lawyerProfile.findUnique({ where: { accountId } });

export const updateSatelliteProfile = async (accountId: string, role: string, data: any) =>
  role === "FIRM"
    ? prisma.firmProfile.update({ where: { accountId }, data })
    : prisma.lawyerProfile.update({ where: { accountId }, data });

export const listVerificationDocuments = async (accountId: string) =>
  prisma.verificationDocument.findMany({
    // Dispute evidence is filed against a dispute, not against this account's
    // own application, so it must not count toward the required-document check.
    where: { accountId, disputeId: null },
    orderBy: { createdAt: "desc" },
  });

export const createVerificationDocument = async (data: {
  accountId: string;
  docType: string;
  s3Key: string;
  disputeId?: string | null;
}) =>
  prisma.verificationDocument.create({
    data: {
      accountId: data.accountId,
      docType: data.docType,
      s3Key: data.s3Key,
      status: "pending",
      disputeId: data.disputeId ?? null,
    },
  });

// --- SCN disputes -----------------------------------------------------------

export const findDisputeByClaimantAndScn = async (claimantAccountId: string, scn: string) =>
  prisma.scnDispute.findUnique({
    where: { claimantAccountId_scn: { claimantAccountId, scn } },
    include: { evidence: true },
  });

export const findDisputeById = async (id: string) =>
  prisma.scnDispute.findUnique({ where: { id }, include: { evidence: true } });

export const findLatestDisputeForClaimant = async (claimantAccountId: string) =>
  prisma.scnDispute.findFirst({
    where: { claimantAccountId },
    orderBy: { createdAt: "desc" },
    include: { evidence: true },
  });

/** Per-year sequence for the case reference the registrant is told to quote. */
export const countDisputesInYear = async (year: number) =>
  prisma.scnDispute.count({
    where: { caseReference: { startsWith: `${DISPUTE_CASE_PREFIX}-${year}-` } },
  });

export const createDispute = async (data: {
  caseReference: string;
  scn: string;
  claimantAccountId: string;
  existingAccountId: string;
  claimantStatement?: string | null;
}) =>
  prisma.scnDispute.create({
    data: { ...data, status: OPEN_DISPUTE_STATUS },
    include: { evidence: true },
  });

export const listOpenDisputes = async (skip: number, take: number, status?: string) => {
  const where = status ? { status } : { status: OPEN_DISPUTE_STATUS };
  const [items, total] = await Promise.all([
    prisma.scnDispute.findMany({
      where,
      include: {
        claimant: { include: { lawyerProfile: true } },
        existingAccount: { include: { lawyerProfile: true } },
        evidence: true,
      },
      orderBy: { createdAt: "asc" },
      skip,
      take,
    }),
    prisma.scnDispute.count({ where }),
  ]);
  return { items, total };
};

export const resolveDispute = async (
  id: string,
  data: { status: string; resolutionNote?: string | null; reviewedByAdminId: string }
) =>
  prisma.scnDispute.update({
    where: { id },
    data: { ...data, reviewedAt: new Date() },
    include: { evidence: true },
  });
