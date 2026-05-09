import { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { redis } from "../config/redis";

export const registerRateLimiter = async (app: FastifyInstance) => {
  await app.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
    redis,
    keyGenerator: (req) => {
      const account = (req as any).account;
      return account?.id || req.ip;
    },
    skipOnError: true,
  });
};

export const stricter = (max: number, timeWindow: string) => ({
  config: {
    rateLimit: { max, timeWindow },
  },
});
