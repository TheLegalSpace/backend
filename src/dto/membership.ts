const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

export const verifyQuerySchema = {
  querystring: {
    type: "object",
    required: ["reference"],
    properties: { reference: { type: "string", minLength: 1, maxLength: 200 } },
  },
};

export const autoRenewBodySchema = {
  body: {
    type: "object",
    required: ["autoRenew"],
    properties: { autoRenew: { type: "boolean" } },
  },
};

export const invoicesQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      page: { type: "integer", default: 1, minimum: 1 },
      limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
    },
  },
};

export const invoiceIdParamSchema = { params: idParam };
