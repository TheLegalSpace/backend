import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireVerifiedAccess } from "../middleware/requireVerifiedAccess";
import { search } from "../controller/search";

export default async function searchRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);
  // Unverified lawyers cannot reach the platform — see requireVerifiedAccess.
  fastify.addHook("preHandler", requireVerifiedAccess);

  fastify.get(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            q: { type: "string", default: "" },
            type: { type: "string", enum: ["lawyer", "firm", "all"], default: "all" },
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
          },
        },
      },
    },
    search
  );
}
