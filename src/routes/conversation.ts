import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireConversationParticipant } from "../middleware/requireConversationParticipant";
import {
  list,
  getById,
  listMessages,
  sendMessage,
  markRead,
  markAllRead,
  close,
  archive,
} from "../controller/conversation";
import { paginationQuery } from "../dto/profile";

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

export default async function conversationRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);

  fastify.get("/", { schema: { querystring: paginationQuery } }, list);
  fastify.get(
    "/:id",
    {
      schema: { params: idParam },
      preHandler: requireConversationParticipant,
    },
    getById
  );
  fastify.get(
    "/:id/messages",
    {
      schema: {
        params: idParam,
        querystring: {
          type: "object",
          properties: {
            before: { type: "string", format: "uuid" },
            limit: { type: "integer", default: 50, minimum: 1, maximum: 100 },
          },
        },
      },
      preHandler: requireConversationParticipant,
    },
    listMessages
  );
  fastify.post(
    "/:id/messages",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          required: ["body"],
          properties: {
            body: { type: "string", minLength: 1, maxLength: 10000 },
            attachments: { type: "array", items: { type: "object" } },
          },
        },
      },
      preHandler: requireConversationParticipant,
    },
    sendMessage
  );
  fastify.patch(
    "/:id/messages/read-all",
    {
      schema: { params: idParam },
      preHandler: requireConversationParticipant,
    },
    markAllRead
  );
  fastify.patch(
    "/:id/messages/:messageId/read",
    {
      schema: {
        params: {
          type: "object",
          required: ["id", "messageId"],
          properties: {
            id: { type: "string", format: "uuid" },
            messageId: { type: "string", format: "uuid" },
          },
        },
      },
      preHandler: requireConversationParticipant,
    },
    markRead
  );
  fastify.post(
    "/:id/close",
    {
      schema: { params: idParam },
      preHandler: requireConversationParticipant,
    },
    close
  );
  fastify.delete(
    "/:id",
    {
      schema: { params: idParam },
      preHandler: requireConversationParticipant,
    },
    archive
  );
}
