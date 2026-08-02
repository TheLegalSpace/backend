import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { requireOwner } from "../middleware/requireOwner";
import { requireCompletedProfile } from "../middleware/requireCompletedProfile";
import { stricter } from "../middleware/rateLimiter";
import { create, createArticle, getById, remove, react, unreact } from "../controller/post";
import { reportReasons, reportPost } from "../controller/postReport";
import { REPORT_REASON_VALUES, REPORT_DETAILS_MAX } from "../config/moderation";

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
  // Static route declared before /:id so the report sheet can fetch its options
  // without a post in hand.
  fastify.get("/report-reasons", reportReasons);

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

  // Any authenticated account can report — clients are the ones who most need
  // it. Rate-limited well below the global cap: a genuine user reports a
  // handful of posts a day, a brigade reports dozens in a minute.
  fastify.post(
    "/:id/reports",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          required: ["reason"],
          properties: {
            reason: { type: "string", enum: REPORT_REASON_VALUES },
            details: { type: "string", maxLength: REPORT_DETAILS_MAX },
          },
        },
      },
      ...stricter(10, "1 hour"),
    },
    reportPost
  );
}
