import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import {
  list,
  getById,
  create,
  update,
  remove,
  uploadCover,
} from "../controller/event";

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

const eventBody = {
  type: "object",
  required: ["title", "startAt"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200 },
    description: { type: "string", maxLength: 5000 },
    location: { type: "string", maxLength: 300 },
    startAt: { type: "string", format: "date-time" },
    endAt: { type: "string", format: "date-time" },
    registrationUrl: { type: "string" },
    status: { type: "string", enum: ["draft", "published", "past"] },
  },
};

export default async function eventRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);

  fastify.get(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["upcoming", "past"], default: "upcoming" },
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    list
  );
  fastify.get("/:id", { schema: { params: idParam } }, getById);
  fastify.post(
    "/",
    { schema: { body: eventBody }, preHandler: requireRole("ADMIN") },
    create
  );
  fastify.patch(
    "/:id",
    {
      schema: { params: idParam, body: { ...eventBody, required: [] } },
      preHandler: requireRole("ADMIN"),
    },
    update
  );
  fastify.delete(
    "/:id",
    { schema: { params: idParam }, preHandler: requireRole("ADMIN") },
    remove
  );
  fastify.post(
    "/:id/cover",
    { schema: { params: idParam }, preHandler: requireRole("ADMIN") },
    uploadCover
  );
}
