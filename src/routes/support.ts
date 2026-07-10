import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { createTicket, listMyTickets } from "../controller/support";

const createTicketBody = {
  type: "object",
  required: ["category", "subject", "body"],
  properties: {
    category: { type: "string", enum: ["billing", "technical", "account", "general"] },
    subject: { type: "string", minLength: 1, maxLength: 200 },
    body: { type: "string", minLength: 1, maxLength: 5000 },
    name: { type: "string", maxLength: 200 },
    email: { type: "string", format: "email" },
  },
};

// User-facing support. Any authenticated account can open a ticket.
export default async function supportRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);

  fastify.post("/tickets", { schema: { body: createTicketBody } }, createTicket);
  fastify.get(
    "/tickets",
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
    listMyTickets
  );
}
