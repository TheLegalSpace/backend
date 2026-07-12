import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import {
  list,
  unreadCount,
  markRead,
  markAllRead,
  subscribePush,
  unsubscribePush,
} from "../controller/notification";
import { paginationQuery } from "../dto/profile";
import { subscribePushSchema, unsubscribePushSchema } from "../dto/notification";

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

  // Web Push device subscriptions. Canonical /push/* paths + bare aliases so the
  // frontend works whether it calls /notifications/push/subscribe or
  // /notifications/subscribe. Unsubscribe accepts POST and DELETE.
  const subOpts = { schema: subscribePushSchema };
  const unsubOpts = { schema: unsubscribePushSchema };

  fastify.post("/push/subscribe", subOpts, subscribePush);
  fastify.post("/subscribe", subOpts, subscribePush);

  fastify.post("/push/unsubscribe", unsubOpts, unsubscribePush);
  fastify.delete("/push/unsubscribe", unsubOpts, unsubscribePush);
  fastify.post("/unsubscribe", unsubOpts, unsubscribePush);
  fastify.delete("/unsubscribe", unsubOpts, unsubscribePush);
}
