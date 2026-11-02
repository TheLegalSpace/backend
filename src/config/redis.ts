import IORedis, { Redis, RedisOptions } from "ioredis";
import { env } from "./env";

// The command client backs caches, debounce keys and the rate limiter — every
// caller already treats a Redis error as a miss (`.catch(() => null)`,
// `skipOnError`). That only works if a dead Redis *errors*: with
// `maxRetriesPerRequest: null` ioredis queues commands until it reconnects,
// so an unreachable host hung every request that touched it instead.
// `commandTimeout` is armed before the offline-queue check, so it bounds queued
// commands too; the queue stays on so a sub-second reconnect blip doesn't drop
// writes like onboarding drafts.
const COMMAND_CLIENT_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: 1,
  commandTimeout: 1000,
  connectTimeout: 5000,
};

// Socket.IO's adapter clients should keep retrying indefinitely — they carry no
// request-path commands, and giving up would silently stop cross-instance fan-out.
const PUBSUB_CLIENT_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: null,
};

const connectionOptions = (): RedisOptions => ({
  host: env.redisHost,
  port: env.redisPort,
  username: env.redisUsername || "default",
  password: env.redisPassword,
  ...(env.redisTls ? { tls: {} } : {}),
});

const createClient = (options: RedisOptions): Redis => {
  if (env.redisUrl) {
    return new IORedis(env.redisUrl, options);
  }
  return new IORedis({ ...connectionOptions(), ...options });
};

export const redis = createClient(COMMAND_CLIENT_OPTIONS);
export const subClient = createClient(PUBSUB_CLIENT_OPTIONS);
export const pubClient = createClient(PUBSUB_CLIENT_OPTIONS);

// Without a listener ioredis prints an "Unhandled error event" stack trace on
// every reconnect attempt, which buries everything else in the logs during an outage.
for (const [name, client] of [["redis", redis], ["redis:sub", subClient], ["redis:pub", pubClient]] as const) {
  client.on("error", (err) => {
    console.error(`[${name}] error:`, err.message);
  });
}
