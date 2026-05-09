import { redis } from "../config/redis";
import { response } from "../helpers/utility";
import { Response, IntakePayload } from "../interface";
import { runMatchmaking } from "../services/matchmaking";
import { buildPagination, paginate } from "../helpers/pagination";
import { maskAccount } from "../services/anonymity";

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
