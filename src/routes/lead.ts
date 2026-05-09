import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { requireVerified } from "../middleware/requireVerified";
import {
  listLeads,
  getLead,
  acceptLead,
  declineLead,
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

export default async function leadRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);
  fastify.addHook("preHandler", requireRole("LAWYER", "FIRM"));

  fastify.get("/", { schema: { querystring: listQuery } }, listLeads);
  fastify.get("/:id", { schema: { params: idParam } }, getLead);
  fastify.post(
    "/:id/accept",
    { schema: { params: idParam }, preHandler: requireVerified },
    acceptLead
  );
  fastify.post(
    "/:id/decline",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          properties: { reason: { type: "string", maxLength: 500 } },
        },
      },
    },
    declineLead
  );
}
