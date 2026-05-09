import { FastifyReply, FastifyRequest } from "fastify";
import { supabase } from "../config/supabase";
import { prisma } from "../config/database";
import { redis } from "../config/redis";
import { unauthorized } from "../helpers/utility";

declare module "fastify" {
  interface FastifyRequest {
    account?: any;
  }
}

const ACCOUNT_CACHE_TTL_SECONDS = 15 * 60;

const loadAccount = async (authUserId: string) => {
  const cacheKey = `account:${authUserId}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // fall through to DB
    }
  }
  const account = await prisma.account.findUnique({
    where: { authUserId },
    include: {
      lawyerProfile: true,
      firmProfile: true,
      practiceAreaLinks: { include: { practiceArea: true } },
    },
  });
  if (account) {
    await redis
      .set(cacheKey, JSON.stringify(account), "EX", ACCOUNT_CACHE_TTL_SECONDS)
      .catch(() => null);
  }
  return account;
};

export const invalidateAccountCache = async (authUserId: string) => {
  await redis.del(`account:${authUserId}`).catch(() => null);
};

const ACTIVITY_DEBOUNCE_KEY = (id: string) => `lastactive:${id}`;

const touchLastActive = async (accountId: string) => {
  const key = ACTIVITY_DEBOUNCE_KEY(accountId);
  const set = await redis.set(key, "1", "EX", 60, "NX").catch(() => null);
  if (set === "OK") {
    prisma.account
      .update({ where: { id: accountId }, data: { lastActiveAt: new Date() } })
      .catch(() => null);
  }
};

export const authHook = async (req: FastifyRequest, reply: FastifyReply) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply.status(401).send({ error: true, message: "Missing bearer token" });
  }
  const token = header.slice(7).trim();
  if (!token) {
    return reply.status(401).send({ error: true, message: "Missing bearer token" });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return reply.status(401).send({ error: true, message: "Invalid or expired token" });
  }

  const account = await loadAccount(data.user.id);
  if (!account) {
    return reply.status(401).send({
      error: true,
      message: "Account not found — please complete registration",
    });
  }
  if (account.status !== "active") {
    return reply.status(403).send({ error: true, message: "Account is not active" });
  }

  req.account = account;
  touchLastActive(account.id);
};
