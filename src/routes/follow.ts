import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { stricter } from "../middleware/rateLimiter";
import { follow, unfollow, listFollowing, listFollowers } from "../controller/follow";
import { paginationQuery } from "../dto/profile";

export default async function followRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);

  fastify.post(
    "/:accountId",
    {
      ...stricter(30, "1 minute"),
      schema: {
        params: {
          type: "object",
          required: ["accountId"],
          properties: { accountId: { type: "string", format: "uuid" } },
        },
      },
    },
    follow
  );
  fastify.delete(
    "/:accountId",
    {
      schema: {
        params: {
          type: "object",
          required: ["accountId"],
          properties: { accountId: { type: "string", format: "uuid" } },
        },
      },
    },
    unfollow
  );
  fastify.get("/me/following", { schema: { querystring: paginationQuery } }, listFollowing);
  fastify.get("/me/followers", { schema: { querystring: paginationQuery } }, listFollowers);
}
