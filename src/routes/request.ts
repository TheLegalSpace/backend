import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { stricter } from "../middleware/rateLimiter";
import {
  create,
  listMyRequests,
  getRequest,
  cancelRequest,
} from "../controller/request";

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

const listQuery = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["pending", "accepted", "declined", "expired", "closed"],
    },
    page: { type: "integer", default: 1, minimum: 1 },
    limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
  },
};

export default async function requestRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);

  fastify.post(
    "/",
    {
      ...stricter(10, "1 hour"),
      schema: {
        body: {
          type: "object",
          required: ["lawyerAccountId", "intakePayload"],
          properties: {
            lawyerAccountId: { type: "string", format: "uuid" },
            intakePayload: { type: "object" },
          },
        },
      },
      preHandler: requireRole("USER"),
    },
    create
  );
  fastify.get(
    "/",
    { schema: { querystring: listQuery }, preHandler: requireRole("USER") },
    listMyRequests
  );
  fastify.get("/:id", { schema: { params: idParam } }, getRequest);
  fastify.delete(
    "/:id",
    { schema: { params: idParam }, preHandler: requireRole("USER") },
    cancelRequest
  );
}
