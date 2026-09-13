import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireVerifiedAccess } from "../middleware/requireVerifiedAccess";
import { requireConversationParticipant } from "../middleware/requireConversationParticipant";
import { submit } from "../controller/review";

export default async function reviewRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);
  // Unverified lawyers cannot reach the platform — see requireVerifiedAccess.
  fastify.addHook("preHandler", requireVerifiedAccess);

  fastify.post(
    "/conversations/:id/reviews",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
        body: {
          type: "object",
          required: ["rating"],
          properties: {
            rating: { type: "integer", minimum: 1, maximum: 5 },
            body: { type: "string", maxLength: 2000 },
          },
        },
      },
      preHandler: requireConversationParticipant,
    },
    submit
  );
}
