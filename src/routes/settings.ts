import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { get, update, changePassword } from "../controller/settings";

export default async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);

  fastify.get("/", get);
  fastify.patch(
    "/",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            notificationEmailEnabled: { type: "boolean" },
            language: { type: "string", maxLength: 10 },
            theme: { type: "string", enum: ["light", "dark", "system"] },
          },
        },
      },
    },
    update
  );
  fastify.patch(
    "/password",
    {
      schema: {
        body: {
          type: "object",
          required: ["newPassword"],
          properties: { newPassword: { type: "string", minLength: 8 } },
        },
      },
    },
    changePassword
  );
}
