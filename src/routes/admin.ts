import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import {
  listAccounts,
  suspend,
  unsuspend,
  kycQueue,
  approveKyc,
  rejectKyc,
  deletePost,
  deleteReview,
  auditLog,
} from "../controller/admin";

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

const accountIdParam = {
  type: "object",
  required: ["accountId"],
  properties: { accountId: { type: "string", format: "uuid" } },
};

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);
  fastify.addHook("preHandler", requireRole("ADMIN"));

  fastify.get(
    "/accounts",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            role: { type: "string" },
            status: { type: "string" },
            verificationStatus: { type: "string" },
            q: { type: "string" },
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    listAccounts
  );

  fastify.patch(
    "/accounts/:id/suspend",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          required: ["reason"],
          properties: { reason: { type: "string", minLength: 1, maxLength: 500 } },
        },
      },
    },
    suspend
  );
  fastify.patch("/accounts/:id/unsuspend", { schema: { params: idParam } }, unsuspend);

  fastify.get(
    "/kyc/queue",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    kycQueue
  );
  fastify.post(
    "/kyc/:accountId/approve",
    { schema: { params: accountIdParam } },
    approveKyc
  );
  fastify.post(
    "/kyc/:accountId/reject",
    {
      schema: {
        params: accountIdParam,
        body: {
          type: "object",
          required: ["reason"],
          properties: { reason: { type: "string", minLength: 1, maxLength: 500 } },
        },
      },
    },
    rejectKyc
  );

  fastify.delete("/posts/:id", { schema: { params: idParam } }, deletePost);
  fastify.delete("/reviews/:id", { schema: { params: idParam } }, deleteReview);

  fastify.get(
    "/audit-log",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            adminAccountId: { type: "string", format: "uuid" },
            action: { type: "string" },
            targetType: { type: "string" },
            dateFrom: { type: "string", format: "date-time" },
            dateTo: { type: "string", format: "date-time" },
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    auditLog
  );
}
