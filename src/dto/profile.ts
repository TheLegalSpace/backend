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
    // `callToBarYear` is NOT required here: it is captured and NBA-checked at
    // the bar-details step, and setup must not overwrite it with a value typed
    // again at the end of the wizard. Accepted and ignored if sent.
    required: ["firstName", "lastName", "whatsappNumber", "locationCity", "practiceAreas"],
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

// --- Professional identity verification (lawyer signup wizard) --------------

export const barDetailsSchema = {
  body: {
    type: "object",
    required: ["fullName", "scn", "callToBarYear"],
    properties: {
      // Name exactly as called to bar. The NBA and NIN checks compare against
      // this, order-sensitively, which is what the screen copy promises.
      fullName: { type: "string", minLength: 3, maxLength: 160 },
      scn: { type: "string", minLength: 4, maxLength: 40 },
      callToBarYear: { type: "integer", minimum: 1900, maximum: 2100 },
      nbaBranch: { type: "string", maxLength: 100 },
    },
  },
};

export const scnDisputeSchema = {
  body: {
    type: "object",
    required: ["scn"],
    properties: {
      scn: { type: "string", minLength: 4, maxLength: 40 },
      statement: { type: "string", maxLength: 2000 },
    },
  },
};

export const identityVerifySchema = {
  body: {
    type: "object",
    required: ["nin", "consent"],
    properties: {
      // Passed to the provider and never stored — see logic/verification.ts.
      nin: { type: "string", minLength: 11, maxLength: 11 },
      consent: { type: "boolean" },
    },
  },
};

export const disputeIdParamSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string", format: "uuid" } },
  },
};
