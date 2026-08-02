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

// Checkout. The billing term is optional and defaults to the 6-month plan;
// `intervalMonths` is canonical, `interval` is the friendly alias.
export const subscribeBodySchema = {
  body: {
    type: "object",
    properties: {
      context: { type: "string", maxLength: 40 },
      callbackUrl: { type: "string", maxLength: 500 },
      intervalMonths: { type: "integer", enum: [6, 12] },
      interval: { type: "string", enum: ["biannual", "annual", "yearly"] },
    },
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
