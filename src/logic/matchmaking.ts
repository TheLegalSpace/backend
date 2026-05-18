import { redis } from "../config/redis";
import { response, badRequest } from "../helpers/utility";
import { Response, IntakePayload } from "../interface";
import { runMatchmaking } from "../services/matchmaking";
import { buildPagination, paginate } from "../helpers/pagination";
import { maskAccount } from "../services/anonymity";
import {
  extractIntakeFromText,
  ExtractionInsufficientError,
  ExtractedIntake,
} from "../services/llm";

const intakeKey = (accountId: string) => `intake:${accountId}`;
const INTAKE_TTL = 24 * 60 * 60;

export const _searchMatches = async (
  intake: IntakePayload,
  viewerId: string,
  page = 1,
  limit = 20
): Promise<Response> => {
  const { items, total } = await runMatchmaking(intake, page, limit);
  const { page: p, limit: l } = paginate(page, limit);
  const decorated = items.map((i) => ({
    account: maskAccount(i.account, viewerId),
    score: i.score,
    matchedFactors: i.matchedFactors,
  }));
  return response({
    error: false,
    message: "Matches retrieved",
    data: { items: decorated, pagination: buildPagination(total, p, l) },
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

export const _restartIntake = async (accountId: string): Promise<Response> => {
  await redis.del(intakeKey(accountId)).catch(() => null);
  return response({ error: false, message: "Intake cleared" });
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
  page = 1,
  limit = 20
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

  const { items, total } = await runMatchmaking(intake, page, limit);
  const { page: p, limit: l } = paginate(page, limit);
  const decorated = items.map((i) => ({
    account: maskAccount(i.account, viewerId),
    score: i.score,
    matchedFactors: i.matchedFactors,
  }));

  return response({
    error: false,
    message: "Matches retrieved",
    data: {
      items: decorated,
      pagination: buildPagination(total, p, l),
      text: trimmed,
      extracted,
    },
  });
};
