import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { getSurvey, submitResponse } from "../controller/survey";

const slugParam = {
  type: "object",
  required: ["slug"],
  properties: { slug: { type: "string" } },
};

const submitBody = {
  type: "object",
  required: ["answer"],
  properties: {
    answer: { type: "string", minLength: 1, maxLength: 40 },
    featureVotes: { type: "array", items: { type: "string", maxLength: 120 } },
  },
};

// Legal News Survey — lawyers/firms only (they are the survey audience).
export default async function surveyRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);
  fastify.addHook("preHandler", requireRole("LAWYER", "FIRM"));

  fastify.get("/:slug", { schema: { params: slugParam } }, getSurvey);
  fastify.post("/:slug/responses", { schema: { params: slugParam, body: submitBody } }, submitResponse);
}
