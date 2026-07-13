import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import {
  createInquiry,
  createEventPromotion,
  verifyPromotion,
  listMine,
  getOne,
} from "../controller/service";

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

const inquiryBody = {
  type: "object",
  required: ["type", "contactEmail"],
  properties: {
    type: {
      type: "string",
      enum: ["website", "appointment", "productivity", "consulting"],
    },
    contactName: { type: "string", maxLength: 200 },
    contactEmail: { type: "string", format: "email" },
    contactPhone: { type: "string", maxLength: 40 },
    firmName: { type: "string", maxLength: 200 },
    payload: { type: "object", additionalProperties: true },
  },
};

export default async function serviceRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);
  // TLS Services (inquiries + event promotion) are open to all account types —
  // clients, lawyers and firms can all host/promote events and submit inquiries.
  fastify.addHook("preHandler", requireRole("USER", "LAWYER", "FIRM"));

  fastify.post("/requests", { schema: { body: inquiryBody } }, createInquiry);

  // Event promotion is multipart (flyer upload) — body validated in the controller/logic.
  fastify.post("/event-promotion", createEventPromotion);

  // Client-side fallback to confirm a promotion payment (mirror of the webhook).
  fastify.get(
    "/event-promotion/verify",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["reference"],
          properties: { reference: { type: "string" } },
        },
      },
    },
    verifyPromotion
  );

  fastify.get(
    "/me",
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
    listMine
  );

  fastify.get("/:id", { schema: { params: idParam } }, getOne);
}
