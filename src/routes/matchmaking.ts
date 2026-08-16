import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { stricter } from "../middleware/rateLimiter";
import {
  search,
  saveIntake,
  getIntake,
  restartIntake,
  searchByText,
  availability,
} from "../controller/matchmaking";

const intakeBody = {
  type: "object",
  required: ["matter", "budget", "location", "preference"],
  properties: {
    matter: { type: "string", format: "uuid" },
    budget: {
      type: "string",
      enum: ["under_100k", "100k_to_500k", "500k_to_2m", "above_2m"],
    },
    location: { type: "string", minLength: 1, maxLength: 80 },
    preference: { type: "string", enum: ["lawyer", "firm", "either"] },
    freeText: { type: "string", maxLength: 5000 },
  },
};

const partialIntakeBody = {
  type: "object",
  properties: {
    matter: { type: "string", format: "uuid" },
    budget: {
      type: "string",
      enum: ["under_100k", "100k_to_500k", "500k_to_2m", "above_2m"],
    },
    location: { type: "string", minLength: 1, maxLength: 80 },
    preference: { type: "string", enum: ["lawyer", "firm", "either"] },
    freeText: { type: "string", maxLength: 5000 },
  },
};

export default async function matchmakingRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);
  fastify.addHook("preHandler", requireRole("USER"));

  fastify.post(
    "/search",
    {
      ...stricter(30, "1 minute"),
      schema: {
        body: intakeBody,
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    search
  );
  // Lets the intake screen tell the client up front that they're on cooldown or
  // out of allowance for a practice area, rather than erroring after they've
  // answered every question.
  fastify.get(
    "/availability",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["practiceAreaId"],
          properties: { practiceAreaId: { type: "string", format: "uuid" } },
        },
      },
    },
    availability
  );

  fastify.post("/intake", { schema: { body: partialIntakeBody } }, saveIntake);
  fastify.get("/intake", getIntake);
  fastify.post("/restart", restartIntake);

  fastify.post(
    "/search-by-text",
    {
      ...stricter(15, "1 minute"),
      schema: {
        body: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string", minLength: 10, maxLength: 5000 },
          },
        },
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
          },
        },
      },
    },
    searchByText
  );
}
