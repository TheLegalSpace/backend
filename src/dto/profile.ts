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

// Each practice area may carry its own fee range (min/max), in kobo.
//
// Fees are optional per area — a lawyer signing up shouldn't have to price every
// specialism before they can finish onboarding. They default to 0 ("not stated")
// and the logic layer requires a fee on at least one area, which is all the
// matchmaking budget filter needs.
const practiceAreaFeeSchema = {
  type: "object",
  required: ["practiceAreaId"],
  properties: {
    practiceAreaId: { type: "string", format: "uuid" },
    minFee: { type: "integer", minimum: 0, default: 0 },
    maxFee: { type: "integer", minimum: 0, default: 0 },
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
    // `officeAddress` is deliberately NOT required. The signup wizard's firm form
    // collects firm name, WhatsApp, year established and location only — a
    // required field the form never renders is a 400 on every firm signup. It
    // stays on FirmProfile and is editable later via PATCH /profile/me/firm.
    required: [
      "firmName",
      "whatsappNumber",
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

// The wizard's per-step draft. Intentionally open-ended — it holds whatever
// subset of the setup payload the user has filled in so far, and the real
// validation happens at POST /profile/me/{lawyer,firm}/setup where the values
// are actually persisted. Size is capped in the logic layer.
export const onboardingDraftSchema = {
  body: {
    type: "object",
    additionalProperties: true,
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
