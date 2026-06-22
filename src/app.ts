import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env, isProd } from "./config/env";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { registerRateLimiter } from "./middleware/rateLimiter";
import { initRealtime } from "./realtime/gateway";
import { startStaleRequestJob } from "./jobs/staleRequests";
import { startTopAccountsJob } from "./jobs/topAccounts";
import { startDormantAccountJob } from "./jobs/dormantAccounts";
import { startEventStatusJob } from "./jobs/eventStatus";
import { startNotificationDigestJob } from "./jobs/notificationDigest";
import { startSubscriptionSweepJob } from "./jobs/subscriptionSweep";

import authRoutes from "./routes/auth";
import profileRoutes from "./routes/profile";
import practiceAreaRoutes from "./routes/practiceArea";
import followRoutes from "./routes/follow";
import postRoutes from "./routes/post";
import feedRoutes from "./routes/feed";
import searchRoutes from "./routes/search";
import matchmakingRoutes from "./routes/matchmaking";
import requestRoutes from "./routes/request";
import leadRoutes from "./routes/lead";
import conversationRoutes from "./routes/conversation";
import reviewRoutes from "./routes/review";
import notificationRoutes from "./routes/notification";
import eventRoutes from "./routes/event";
import settingsRoutes from "./routes/settings";
import adminRoutes from "./routes/admin";
import researchRoutes from "./routes/research";
import serviceRoutes from "./routes/service";
import membershipRoutes from "./routes/membership";
import webhookRoutes from "./routes/webhooks";

const buildServer = async () => {
  const app = Fastify({
    logger: isProd
      ? true
      : { transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss" } } },
    trustProxy: true,
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024 },
  });
  await registerRateLimiter(app);

  await app.register(swagger, {
    openapi: {
      info: {
        title: "The Legal Space API",
        description: "Two-sided platform connecting Nigerian users with verified lawyers and law firms",
        version: "0.1.0",
      },
      servers: [{ url: `https://legalspace.onrender.com${env.apiPrefix}` }],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/health", async () => ({ ok: true, env: env.nodeEnv }));

  await app.register(
    async (api) => {
      api.register(authRoutes, { prefix: "/auth" });
      api.register(profileRoutes, { prefix: "/profile" });
      api.register(practiceAreaRoutes, { prefix: "/practice-areas" });
      api.register(followRoutes, { prefix: "/follows" });
      api.register(postRoutes, { prefix: "/posts" });
      api.register(feedRoutes, { prefix: "/feed" });
      api.register(searchRoutes, { prefix: "/search" });
      api.register(matchmakingRoutes, { prefix: "/matchmaking" });
      api.register(requestRoutes, { prefix: "/requests" });
      api.register(leadRoutes, { prefix: "/leads" });
      api.register(conversationRoutes, { prefix: "/conversations" });
      api.register(reviewRoutes); // mounts /conversations/:id/reviews
      api.register(notificationRoutes, { prefix: "/notifications" });
      api.register(eventRoutes, { prefix: "/events" });
      api.register(settingsRoutes, { prefix: "/settings" });
      api.register(adminRoutes, { prefix: "/admin" });
      api.register(researchRoutes, { prefix: "/research" });
      api.register(serviceRoutes, { prefix: "/services" });
      api.register(membershipRoutes, { prefix: "/membership" });
    },
    { prefix: env.apiPrefix }
  );

  // Webhooks mount unprefixed (no API prefix, no auth) — verified by HMAC signature.
  await app.register(webhookRoutes, { prefix: "/webhooks" });

  return app;
};

const start = async () => {
  const app = await buildServer();
  await connectDatabase();

  initRealtime(app.server);

  startStaleRequestJob();
  startTopAccountsJob();
  startDormantAccountJob();
  startEventStatusJob();
  startNotificationDigestJob();
  startSubscriptionSweepJob();
  console.log("[app] cron jobs scheduled");

  const shutdown = async () => {
    await app.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
    console.log(`[app] listening on :${env.port}${env.apiPrefix}`);
    console.log(`[app] swagger at /docs`);
    console.log(`[app] socket.io at ${env.socketPath}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

export { buildServer };
