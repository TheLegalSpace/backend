import IORedis, { Redis, RedisOptions } from "ioredis";
import { env } from "./env";

const buildOptions = (): RedisOptions => {
  if (env.redisUrl) {
    return {};
  }
  return {
    host: env.redisHost,
    port: env.redisPort,
    username: env.redisUsername || "default",
    password: env.redisPassword,
    ...(env.redisTls ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
};

const createClient = (): Redis => {
  if (env.redisUrl) {
    return new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  }
  return new IORedis(buildOptions());
};

export const redis = createClient();
export const bullConnection = createClient();
export const subClient = createClient();
export const pubClient = createClient();

redis.on("error", (err) => {
  console.error("[redis] error:", err.message);
});
