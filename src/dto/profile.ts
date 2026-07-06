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

// Each practice area carries its own fee range (min/max), in kobo.
const practiceAreaFeeSchema = {
  type: "object",
  required: ["practiceAreaId", "minFee", "maxFee"],
  properties: {
    practiceAreaId: { type: "string", format: "uuid" },
    minFee: { type: "integer", minimum: 0 },
    maxFee: { type: "integer", minimum: 0 },
  },
};

export const updatePracticeAreasSchema = {
  body: {
    type: "object",
    required: ["practiceAreas"],
    properties: {
      practiceAreas: {
        type: "array",
        minItems: 1,
        items: practiceAreaFeeSchema,
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

export const professionalRoleSchema = {
  body: {
    type: "object",
    required: ["role"],
    properties: {
      role: { type: "string", enum: ["LAWYER", "FIRM"] },
    },
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
      "practiceAreas",
    ],
    properties: {
      firstName: { type: "string", minLength: 1, maxLength: 80 },
      lastName: { type: "string", minLength: 1, maxLength: 80 },
      whatsappNumber: { type: "string", minLength: 4, maxLength: 30 },
      callToBarYear: { type: "integer", minimum: 1900, maximum: 2100 },
      locationCity: { type: "string", minLength: 1, maxLength: 80 },
      locationCountry: { type: "string", maxLength: 80 },
      practiceAreas: {
        type: "array",
        minItems: 1,
        items: practiceAreaFeeSchema,
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
      "practiceAreas",
    ],
    properties: {
      firmName: { type: "string", minLength: 1, maxLength: 200 },
      whatsappNumber: { type: "string", minLength: 4, maxLength: 30 },
      officeAddress: { type: "string", minLength: 1, maxLength: 500 },
      firmEstablishmentYear: { type: "integer", minimum: 1800, maximum: 2100 },
      locationCity: { type: "string", minLength: 1, maxLength: 80 },
      locationCountry: { type: "string", maxLength: 80 },
      practiceAreas: {
        type: "array",
        minItems: 1,
        items: practiceAreaFeeSchema,
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
