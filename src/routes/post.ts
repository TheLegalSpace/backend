import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireOwner } from "../middleware/requireOwner";
import { create, getById, remove, react, unreact } from "../controller/post";

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

export default async function postRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);

  fastify.post(
    "/",
    {
      schema: {
        body: {
          type: "object",
          required: ["body"],
          properties: {
            body: { type: "string", minLength: 1, maxLength: 5000 },
            attachedArticleId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    create
  );
  fastify.get("/:id", { schema: { params: idParam } }, getById);
  fastify.delete(
    "/:id",
    { schema: { params: idParam }, preHandler: requireOwner("post") },
    remove
  );
  fastify.post(
    "/:id/reactions",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          required: ["type"],
          properties: { type: { type: "string", enum: ["like", "dislike"] } },
        },
      },
    },
    react
  );
  fastify.delete("/:id/reactions", { schema: { params: idParam } }, unreact);
}
