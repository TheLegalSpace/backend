import { randomUUID } from "crypto";
import { redis } from "../config/redis";
import { response, badRequest, notFound } from "../helpers/utility";
import { Response, IntakePayload } from "../interface";
import { selectOfferCandidates } from "../services/matchmaking";
import { buildPagination } from "../helpers/pagination";
import { maskAccount } from "../services/anonymity";
import { redactFees } from "../services/feeVisibility";
import { logSearch } from "../dao/analytics";
import { prisma } from "../config/database";
import {
  createOfferBatch,
  findPinnedOfferBatch,
  countOfferBatchesInWindow,
  nextRollAvailableAt,
} from "../dao/matchOffer";
import {
  MATCH_COOLDOWN_MS,
  MATCH_COOLDOWN_HOURS,
  OFFER_VALID_MS,
  OFFER_WINDOW_MS,
  OFFER_WINDOW_DAYS,
  OFFERS_PER_AREA_PER_WINDOW,
} from "../config/matchmaking";
import {
  extractIntakeFromText,
  ExtractionInsufficientError,
  ExtractedIntake,
} from "../services/llm";

const intakeKey = (accountId: string) => `intake:${accountId}`;
const INTAKE_TTL = 24 * 60 * 60;

const hoursUntil = (target: Date, now: Date): number =>
  Math.max(1, Math.ceil((target.getTime() - now.getTime()) / (60 * 60 * 1000)));

/**
 * Shape an offer batch (rows from `dao/matchOffer`) into the response body.
 *
 * `items` is kept as an array with `pagination` even though it holds at most two
 * entries — one lawyer, one firm. The platform matches rather than lists, but
 * keeping the envelope means existing clients render the result without a rewrite.
 */
const presentOffer = (
  rows: any[],
  viewerId: string,
  meta: { pinned: boolean; cooldownUntil: Date | null; offersUsed: number }
) => {
  const items = rows.map((r) => ({
    // Fees are never shown to a client — not even on the lawyer they were matched
    // with. The budget filter still runs server-side, so the match is inside what
    // they said they could pay; `budgetRelaxed` below is how they're told when it
    // isn't, since they can't read the figure for themselves.
    account: redactFees(maskAccount(r.offeredAccount, viewerId)),
    score: r.score,
    matchedFactors: Array.isArray(r.matchedFactors) ? r.matchedFactors : [],
  }));
  const first = rows[0];
  return {
    items,
    pagination: buildPagination(items.length, 1, Math.max(items.length, 1)),
    offer: first
      ? {
          batchId: first.batchId,
          practiceAreaId: first.practiceAreaId,
          // How long the client has to act on this match before it lapses.
          expiresAt: first.expiresAt,
          // When they may be matched again for this practice area.
          cooldownUntil: meta.cooldownUntil,
          // True when this is the offer they already had, replayed rather than redrawn.
          pinned: meta.pinned,
          // Nobody was in budget, so the ceiling was lifted to avoid a dead end.
          budgetRelaxed: first.budgetRelaxed,
          offersUsed: meta.offersUsed,
          offersAllowed: OFFERS_PER_AREA_PER_WINDOW,
          windowDays: OFFER_WINDOW_DAYS,
        }
      : null,
  };
};

/**
 * Match a client to one lawyer and/or one firm.
 *
 * Order matters here:
 *   1. an unreleased offer inside the cooldown is REPLAYED, not redrawn — this is
 *      what stops a repeat search enumerating the roster's pricing
 *   2. otherwise the per-area quota is checked
 *   3. otherwise a fresh batch is drawn and persisted
 */
export const _searchMatches = async (
  intake: IntakePayload,
  viewerId: string,
  _page = 1,
  _limit = 20,
  opts: { rand?: () => number; now?: Date } = {}
): Promise<Response> => {
  const now = opts.now ?? new Date();

  const area = await prisma.practiceArea.findUnique({
    where: { id: intake.matter },
    select: { id: true, isActive: true },
  });
  if (!area || !area.isActive) throw badRequest("Unknown practice area");

  // 1. Replay a pinned offer.
  const cooldownSince = new Date(now.getTime() - MATCH_COOLDOWN_MS);
  const pinned = await findPinnedOfferBatch(viewerId, intake.matter, cooldownSince);
  if (pinned && pinned.length > 0) {
    const cooldownUntil = new Date(pinned[0].createdAt.getTime() + MATCH_COOLDOWN_MS);
    const offersUsed = await countOfferBatchesInWindow(
      viewerId,
      intake.matter,
      new Date(now.getTime() - OFFER_WINDOW_MS)
    );
    return response({
      error: false,
      message: "Match retrieved",
      data: presentOffer(pinned, viewerId, { pinned: true, cooldownUntil, offersUsed }),
    });
  }

  // 2. Quota for this practice area.
  const windowStart = new Date(now.getTime() - OFFER_WINDOW_MS);
  const used = await countOfferBatchesInWindow(viewerId, intake.matter, windowStart);
  if (used >= OFFERS_PER_AREA_PER_WINDOW) {
    throw badRequest(
      `You've used your ${OFFERS_PER_AREA_PER_WINDOW} matches for this type of matter in the last ${OFFER_WINDOW_DAYS} days. You can be matched again for it soon, or start a request for a different type of legal matter.`
    );
  }

  // 3. Fresh draw.
  const { picks, budgetRelaxed } = await selectOfferCandidates(intake, viewerId, {
    rand: opts.rand,
    now,
  });
  if (picks.length === 0) {
    throw notFound(
      "We couldn't find a lawyer for that type of matter right now. Try a different practice area, or check back shortly."
    );
  }

  const batchId = randomUUID();
  const rows = await createOfferBatch({
    batchId,
    userAccountId: viewerId,
    practiceAreaId: intake.matter,
    intakeSnapshot: intake as any,
    budgetRelaxed,
    expiresAt: new Date(now.getTime() + OFFER_VALID_MS),
    rows: picks.map((p) => ({
      offeredAccountId: p.account.id,
      offeredRole: p.account.role,
      score: p.score,
      matchedFactors: p.matchedFactors,
    })),
  });

  logSearch({
    accountId: viewerId,
    query: intake.freeText || "",
    kind: "matchmaking",
    resultCount: rows.length,
  });

  return response({
    error: false,
    message: "Match retrieved",
    data: presentOffer(rows, viewerId, {
      pinned: false,
      cooldownUntil: new Date(now.getTime() + MATCH_COOLDOWN_MS),
      offersUsed: used + 1,
    }),
  });
};

export const _saveIntake = async (
  accountId: string,
  partial: Partial<IntakePayload>
): Promise<Response> => {
  const existing = await redis.get(intakeKey(accountId)).catch(() => null);
  let merged: any = {};
  if (existing) {
    try {
      merged = JSON.parse(existing);
    } catch {}
  }
  merged = { ...merged, ...partial };
  await redis
    .set(intakeKey(accountId), JSON.stringify(merged), "EX", INTAKE_TTL)
    .catch(() => null);
  return response({ error: false, message: "Intake saved", data: merged });
};

export const _getIntake = async (accountId: string): Promise<Response> => {
  const cached = await redis.get(intakeKey(accountId)).catch(() => null);
  if (!cached) {
    return response({ error: false, message: "Intake retrieved", data: {} });
  }
  try {
    return response({
      error: false,
      message: "Intake retrieved",
      data: JSON.parse(cached),
    });
  } catch {
    return response({ error: false, message: "Intake retrieved", data: {} });
  }
};

/**
 * Clears the saved intake only. It deliberately does NOT clear the pinned offer —
 * "restart" is a UI affordance for redoing the questionnaire, not a way to reroll
 * the match, which would defeat the cooldown entirely.
 */
export const _restartIntake = async (accountId: string): Promise<Response> => {
  await redis.del(intakeKey(accountId)).catch(() => null);
  return response({ error: false, message: "Intake cleared" });
};

/**
 * When a client may next be matched for a practice area, and how much of their
 * allowance is left. Lets the UI say "you can be matched again in 14 hours"
 * instead of surfacing a bare error after they've filled the whole intake in.
 */
export const _matchAvailability = async (
  accountId: string,
  practiceAreaId: string,
  now: Date = new Date()
): Promise<Response> => {
  const cooldownSince = new Date(now.getTime() - MATCH_COOLDOWN_MS);
  const windowStart = new Date(now.getTime() - OFFER_WINDOW_MS);
  const [nextAt, used] = await Promise.all([
    nextRollAvailableAt(accountId, practiceAreaId, cooldownSince, MATCH_COOLDOWN_MS),
    countOfferBatchesInWindow(accountId, practiceAreaId, windowStart),
  ]);
  const quotaExhausted = used >= OFFERS_PER_AREA_PER_WINDOW;
  const onCooldown = !!nextAt && nextAt.getTime() > now.getTime();
  return response({
    error: false,
    message: "Match availability retrieved",
    data: {
      practiceAreaId,
      available: !quotaExhausted && !onCooldown,
      onCooldown,
      cooldownUntil: nextAt,
      cooldownHours: MATCH_COOLDOWN_HOURS,
      hoursRemaining: onCooldown && nextAt ? hoursUntil(nextAt, now) : 0,
      offersUsed: used,
      offersAllowed: OFFERS_PER_AREA_PER_WINDOW,
      windowDays: OFFER_WINDOW_DAYS,
      quotaExhausted,
    },
  });
};

const buildIntakeFloorMessage = (extracted: ExtractedIntake): string => {
  const missing: string[] = [];
  if (!extracted.matter) missing.push("the type of legal matter (e.g. tenancy, divorce, company registration)");
  if (!extracted.budget && !extracted.location) {
    missing.push("either your budget or your location");
  }
  return `We couldn't determine enough from your description. Please mention ${missing.join(" and ")}.`;
};

export const _searchByText = async (
  text: string,
  viewerId: string,
  _page = 1,
  _limit = 20,
  opts: { rand?: () => number; now?: Date } = {}
): Promise<Response> => {
  const trimmed = (text || "").trim();
  if (trimmed.length < 10) {
    throw badRequest("Please describe your legal matter in at least a sentence");
  }

  const extracted = await extractIntakeFromText(trimmed);

  const hasMatter = !!extracted.matter;
  const hasBudgetOrLocation = !!extracted.budget || !!extracted.location;
  if (!hasMatter || !hasBudgetOrLocation) {
    throw new ExtractionInsufficientError(
      buildIntakeFloorMessage(extracted),
      extracted,
      trimmed
    );
  }

  const intake: IntakePayload = {
    matter: extracted.matter!.id,
    budget: extracted.budget ?? "above_2m",
    location: extracted.location ?? "",
    preference: extracted.preference ?? "either",
    freeText: trimmed,
  };

  // Same offer machinery as the structured path — the free-text route must not be
  // a way around the cooldown and quota.
  const result = await _searchMatches(intake, viewerId, 1, 20, opts);

  logSearch({
    accountId: viewerId,
    query: trimmed,
    kind: "matchmaking_text",
    resultCount: result.data?.items?.length ?? 0,
  });

  return response({
    error: false,
    message: result.message,
    data: { ...result.data, text: trimmed, extracted },
  });
};
