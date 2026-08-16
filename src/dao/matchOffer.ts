import { prisma } from "../config/database";

const OFFER_ACCOUNT_INCLUDE = {
  offeredAccount: {
    include: { lawyerProfile: true, firmProfile: true, practiceAreaLinks: true },
  },
} as const;

export interface NewOfferRow {
  offeredAccountId: string;
  offeredRole: string;
  score: number;
  matchedFactors: any;
}

export const createOfferBatch = async (data: {
  batchId: string;
  userAccountId: string;
  practiceAreaId: string;
  intakeSnapshot: any;
  budgetRelaxed: boolean;
  expiresAt: Date;
  rows: NewOfferRow[];
}) => {
  await prisma.matchOffer.createMany({
    data: data.rows.map((r) => ({
      batchId: data.batchId,
      userAccountId: data.userAccountId,
      practiceAreaId: data.practiceAreaId,
      intakeSnapshot: data.intakeSnapshot,
      budgetRelaxed: data.budgetRelaxed,
      expiresAt: data.expiresAt,
      offeredAccountId: r.offeredAccountId,
      offeredRole: r.offeredRole,
      score: r.score,
      matchedFactors: r.matchedFactors,
    })),
  });
  return findOfferBatch(data.batchId);
};

export const findOfferBatch = async (batchId: string) => {
  return prisma.matchOffer.findMany({
    where: { batchId },
    include: OFFER_ACCOUNT_INCLUDE,
    orderBy: { score: "desc" },
  });
};

/**
 * The batch that currently pins this user's matching for a practice area: the most
 * recent unreleased batch created inside the cooldown window.
 *
 * While one exists, a repeat search replays it instead of drawing again. That is
 * what stops a client re-running the same intake to enumerate the roster.
 */
export const findPinnedOfferBatch = async (
  userAccountId: string,
  practiceAreaId: string,
  cooldownSince: Date
) => {
  const latest = await prisma.matchOffer.findFirst({
    where: {
      userAccountId,
      practiceAreaId,
      releasedAt: null,
      createdAt: { gte: cooldownSince },
    },
    orderBy: { createdAt: "desc" },
    select: { batchId: true },
  });
  if (!latest) return null;
  return findOfferBatch(latest.batchId);
};

/**
 * A live offer of `offeredAccountId` to `userAccountId` — unreleased, unexpired,
 * and not already spent on a request. This is the gate on POST /requests: you can
 * only request someone the system actually offered you.
 */
export const findActionableOffer = async (
  userAccountId: string,
  offeredAccountId: string,
  now: Date = new Date()
) => {
  return prisma.matchOffer.findFirst({
    where: {
      userAccountId,
      offeredAccountId,
      releasedAt: null,
      requestId: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
};

/**
 * Offer batches for this user + practice area inside the quota window.
 *
 * Released batches are excluded on purpose: if the offered lawyer declined or let
 * the request lapse, the client got nothing out of it and should not have burned
 * an allowance. Batches that were simply never acted on DO count — they are still
 * a look at a price, which is the thing the quota exists to ration.
 */
export const countOfferBatchesInWindow = async (
  userAccountId: string,
  practiceAreaId: string,
  since: Date
): Promise<number> => {
  const rows = await prisma.matchOffer.findMany({
    where: {
      userAccountId,
      practiceAreaId,
      releasedAt: null,
      createdAt: { gte: since },
    },
    select: { batchId: true },
    distinct: ["batchId"],
  });
  return rows.length;
};

/** Earliest moment a new roll becomes possible, or null if one is possible now. */
export const nextRollAvailableAt = async (
  userAccountId: string,
  practiceAreaId: string,
  cooldownSince: Date,
  cooldownMs: number
): Promise<Date | null> => {
  const latest = await prisma.matchOffer.findFirst({
    where: {
      userAccountId,
      practiceAreaId,
      releasedAt: null,
      createdAt: { gte: cooldownSince },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!latest) return null;
  return new Date(latest.createdAt.getTime() + cooldownMs);
};

export const attachRequestToOffer = async (offerId: string, requestId: string) => {
  return prisma.matchOffer.update({
    where: { id: offerId },
    data: { requestId },
  });
};

/**
 * Release the batch an offer belongs to, but only once nothing live remains from
 * it — no pending request, no accepted one. Releasing lifts the cooldown and frees
 * the quota slot so the client can be matched with someone else straight away.
 *
 * Called when a lawyer declines and when a request lapses unanswered.
 */
export const releaseBatchIfSettled = async (
  requestId: string,
  now: Date = new Date()
): Promise<number> => {
  const offer = await prisma.matchOffer.findFirst({
    where: { requestId },
    select: { batchId: true },
  });
  if (!offer) return 0;

  const siblings = await prisma.matchOffer.findMany({
    where: { batchId: offer.batchId, releasedAt: null },
    select: { requestId: true },
  });
  const liveRequestIds = siblings
    .map((s) => s.requestId)
    .filter((id): id is string => !!id);

  if (liveRequestIds.length > 0) {
    const stillLive = await prisma.request.count({
      where: { id: { in: liveRequestIds }, status: { in: ["pending", "accepted"] } },
    });
    if (stillLive > 0) return 0;
  }

  const result = await prisma.matchOffer.updateMany({
    where: { batchId: offer.batchId, releasedAt: null },
    data: { releasedAt: now },
  });
  return result.count;
};
