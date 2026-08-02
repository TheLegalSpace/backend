// Fastify JSON-Schema validation for the credits routes.

export const purchaseBodySchema = {
  body: {
    type: "object",
    required: ["packCode"],
    properties: {
      packCode: { type: "string", enum: ["small", "medium", "bulk"] },
      callbackUrl: { type: "string" },
    },
  },
};

export const verifyQuerySchema = {
  querystring: {
    type: "object",
    required: ["reference"],
    properties: { reference: { type: "string" } },
  },
};

export const transactionsQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      page: { type: "integer", default: 1, minimum: 1 },
      limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
    },
  },
};
