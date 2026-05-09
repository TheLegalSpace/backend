import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { list, create, update } from "../controller/practiceArea";

export default async function practiceAreaRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);

  fastify.get("/", list);
  fastify.post(
    "/",
    {
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string", minLength: 1, maxLength: 100 } },
        },
      },
      preHandler: requireRole("ADMIN"),
    },
    create
  );
  fastify.patch(
    "/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            isActive: { type: "boolean" },
          },
        },
      },
      preHandler: requireRole("ADMIN"),
    },
    update
  );
}
