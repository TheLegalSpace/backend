import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { requireOwner } from "../middleware/requireOwner";
import {
  create,
  getBySlug,
  update,
  remove,
  recordRead,
  react,
  unreact,
  uploadCover,
} from "../controller/article";

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

export default async function articleRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);

  fastify.post(
    "/",
    {
      schema: {
        body: {
          type: "object",
          required: ["title", "body"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 200 },
            body: { type: "string", minLength: 1 },
            coverUrl: { type: "string" },
            status: { type: "string", enum: ["draft", "published"] },
          },
        },
      },
      preHandler: requireRole("LAWYER", "FIRM"),
    },
    create
  );

  fastify.get(
    "/:slug",
    {
      schema: {
        params: {
          type: "object",
          required: ["slug"],
          properties: { slug: { type: "string" } },
        },
      },
    },
    getBySlug
  );

  fastify.patch(
    "/:id",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          properties: {
            title: { type: "string", maxLength: 200 },
            body: { type: "string" },
            coverUrl: { type: "string" },
            status: { type: "string", enum: ["draft", "published"] },
          },
        },
      },
      preHandler: requireOwner("article"),
    },
    update
  );

  fastify.delete(
    "/:id",
    { schema: { params: idParam }, preHandler: requireOwner("article") },
    remove
  );

  fastify.post("/:id/read", { schema: { params: idParam } }, recordRead);

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

  fastify.post(
    "/:id/cover",
    { schema: { params: idParam }, preHandler: requireOwner("article") },
    uploadCover
  );
}
