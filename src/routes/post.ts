import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { requireOwner } from "../middleware/requireOwner";
import { requireCompletedProfile } from "../middleware/requireCompletedProfile";
import { create, createArticle, getById, remove, react, unreact } from "../controller/post";

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
            title: { type: "string", maxLength: 200 },
            body: { type: "string", minLength: 1, maxLength: 5000 },
          },
        },
      },
      preHandler: [requireRole("LAWYER", "FIRM"), requireCompletedProfile],
    },
    create
  );
  fastify.post(
    "/article",
    { preHandler: [requireRole("LAWYER", "FIRM"), requireCompletedProfile] },
    createArticle
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
