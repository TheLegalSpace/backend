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
      callToBarYear: { type: "integer", minimum: 1900, maximum: 2100 },
      nbaBranch: { type: "string", maxLength: 100 },
      feeRangeMin: { type: "integer", minimum: 0 },
      feeRangeMax: { type: "integer", minimum: 0 },
    },
  },
};

export const updateFirmSchema = {
  body: {
    type: "object",
    properties: {
      firmName: { type: "string", minLength: 1, maxLength: 200 },
      firmEstablishmentYear: { type: "integer", minimum: 1800, maximum: 2100 },
      feeRangeMin: { type: "integer", minimum: 0 },
      feeRangeMax: { type: "integer", minimum: 0 },
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
