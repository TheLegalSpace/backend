import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { getFeed, getSidebar } from "../controller/feed";

export default async function feedRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);

  fastify.get(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            filter: {
              type: "string",
              enum: ["all", "top_firms", "top_lawyers", "articles", "events"],
              default: "all",
            },
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
          },
        },
      },
    },
    getFeed
  );
  fastify.get("/sidebar", getSidebar);
}
