import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import {
  list,
  unreadCount,
  markRead,
  markAllRead,
} from "../controller/notification";
import { paginationQuery } from "../dto/profile";

export default async function notificationRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);

  fastify.get("/", { schema: { querystring: paginationQuery } }, list);
  fastify.get("/unread-count", unreadCount);
  fastify.patch(
    "/:id/read",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
      },
    },
    markRead
  );
  fastify.patch("/read-all", markAllRead);
}
