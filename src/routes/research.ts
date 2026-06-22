import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { requireProfessional } from "../middleware/requireProfessional";
import { stricter } from "../middleware/rateLimiter";
import {
  createThread,
  listThreads,
  getThread,
  patchThread,
  deleteThread,
  postMessage,
} from "../controller/research";

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

export default async function researchRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);
  fastify.addHook("preHandler", requireRole("LAWYER", "FIRM"));
  // TLS Research is a Professional-membership feature (see the plan comparison cards).
  fastify.addHook("preHandler", requireProfessional);

  fastify.post("/threads", createThread);
  fastify.get("/threads", listThreads);
  fastify.get("/threads/:id", { schema: { params: idParam } }, getThread);
  fastify.patch(
    "/threads/:id",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          properties: {
            title: { type: "string", minLength: 1, maxLength: 120 },
            pinned: { type: "boolean" },
          },
        },
      },
    },
    patchThread
  );
  fastify.delete("/threads/:id", { schema: { params: idParam } }, deleteThread);
  fastify.post(
    "/threads/:id/messages",
    { ...stricter(15, "1 minute"), schema: { params: idParam } },
    postMessage
  );
}
