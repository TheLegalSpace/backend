export const updateProfileSchema = {
  body: {
    type: "object",
    properties: {
      bio: { type: "string", maxLength: 500 },
      phone: { type: "string", maxLength: 30 },
      locationCity: { type: "string", maxLength: 80 },
      locationCountry: { type: "string", maxLength: 80 },
    },
  },
};

export const toggleAnonymousSchema = {
  body: {
    type: "object",
    required: ["isAnonymous"],
    properties: { isAnonymous: { type: "boolean" } },
  },
};

export const updatePracticeAreasSchema = {
  body: {
    type: "object",
    required: ["practiceAreaIds"],
    properties: {
      practiceAreaIds: {
        type: "array",
        minItems: 1,
        items: { type: "string", format: "uuid" },
      },
    },
  },
};

export const updateLawyerSchema = {
  body: {
    type: "object",
    properties: {
      firstName: { type: "string", minLength: 1, maxLength: 80 },
      lastName: { type: "string", minLength: 1, maxLength: 80 },
      callToBarYear: { type: "integer", minimum: 1900, maximum: 2100 },
      nbaBranch: { type: "string", maxLength: 100 },
    },
  },
};

export const updateFirmSchema = {
  body: {
    type: "object",
    properties: {
      firmName: { type: "string", minLength: 1, maxLength: 200 },
      firmEstablishmentYear: { type: "integer", minimum: 1800, maximum: 2100 },
      officeAddress: { type: "string", maxLength: 500 },
    },
  },
};

const serviceItemSchema = {
  type: "object",
  required: ["practiceAreaId", "name", "price"],
  properties: {
    practiceAreaId: { type: "string", format: "uuid" },
    name: { type: "string", minLength: 1, maxLength: 200 },
    price: { type: "integer", minimum: 0 },
  },
};

export const lawyerSetupSchema = {
  body: {
    type: "object",
    required: [
      "firstName",
      "lastName",
      "whatsappNumber",
      "callToBarYear",
      "locationCity",
      "practiceAreaIds",
      "services",
    ],
    properties: {
      firstName: { type: "string", minLength: 1, maxLength: 80 },
      lastName: { type: "string", minLength: 1, maxLength: 80 },
      whatsappNumber: { type: "string", minLength: 4, maxLength: 30 },
      callToBarYear: { type: "integer", minimum: 1900, maximum: 2100 },
      locationCity: { type: "string", minLength: 1, maxLength: 80 },
      locationCountry: { type: "string", maxLength: 80 },
      practiceAreaIds: {
        type: "array",
        minItems: 1,
        items: { type: "string", format: "uuid" },
      },
      services: {
        type: "array",
        minItems: 1,
        items: serviceItemSchema,
      },
    },
  },
};

export const firmSetupSchema = {
  body: {
    type: "object",
    required: [
      "firmName",
      "whatsappNumber",
      "officeAddress",
      "firmEstablishmentYear",
      "locationCity",
      "practiceAreaIds",
      "services",
    ],
    properties: {
      firmName: { type: "string", minLength: 1, maxLength: 200 },
      whatsappNumber: { type: "string", minLength: 4, maxLength: 30 },
      officeAddress: { type: "string", minLength: 1, maxLength: 500 },
      firmEstablishmentYear: { type: "integer", minimum: 1800, maximum: 2100 },
      locationCity: { type: "string", minLength: 1, maxLength: 80 },
      locationCountry: { type: "string", maxLength: 80 },
      practiceAreaIds: {
        type: "array",
        minItems: 1,
        items: { type: "string", format: "uuid" },
      },
      services: {
        type: "array",
        minItems: 1,
        items: serviceItemSchema,
      },
    },
  },
};

export const verificationDocSchema = {
  querystring: {
    type: "object",
    required: ["docType"],
    properties: {
      docType: {
        type: "string",
        enum: ["call_to_bar_cert", "practicing_cert", "id_card", "cac_cert"],
      },
    },
  },
};

export const paginationQuery = {
  type: "object",
  properties: {
    page: { type: "integer", default: 1, minimum: 1 },
    limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
  },
};
