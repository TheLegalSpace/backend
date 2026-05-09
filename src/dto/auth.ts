const emailPath = {
  authProvider: { type: "string", enum: ["email"] },
  email: { type: "string", format: "email" },
  password: { type: "string", minLength: 8 },
};

const googlePath = {
  authProvider: { type: "string", enum: ["google"] },
  idToken: { type: "string", minLength: 10 },
};

export const registerUserSchema = {
  body: {
    type: "object",
    required: ["authProvider", "fullName"],
    properties: {
      ...emailPath,
      ...googlePath,
      authProvider: { type: "string", enum: ["email", "google"] },
      fullName: { type: "string", minLength: 1, maxLength: 100 },
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 8 },
      idToken: { type: "string" },
    },
  },
};

export const registerLawyerSchema = {
  body: {
    type: "object",
    required: [
      "authProvider",
      "fullName",
      "scn",
      "callToBarYear",
      "practiceAreaIds",
      "feeRangeMin",
      "feeRangeMax",
      "locationCity",
    ],
    properties: {
      authProvider: { type: "string", enum: ["email", "google"] },
      fullName: { type: "string", minLength: 1, maxLength: 100 },
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 8 },
      idToken: { type: "string" },
      scn: { type: "string", minLength: 3, maxLength: 32 },
      callToBarYear: { type: "integer", minimum: 1900, maximum: 2100 },
      nbaBranch: { type: "string", maxLength: 100 },
      practiceAreaIds: {
        type: "array",
        minItems: 1,
        items: { type: "string", format: "uuid" },
      },
      feeRangeMin: { type: "integer", minimum: 0 },
      feeRangeMax: { type: "integer", minimum: 0 },
      locationCity: { type: "string", minLength: 1, maxLength: 80 },
      locationCountry: { type: "string", maxLength: 80 },
    },
  },
};

export const registerFirmSchema = {
  body: {
    type: "object",
    required: [
      "authProvider",
      "firmName",
      "rcNumber",
      "firmEstablishmentYear",
      "practiceAreaIds",
      "feeRangeMin",
      "feeRangeMax",
      "locationCity",
    ],
    properties: {
      authProvider: { type: "string", enum: ["email", "google"] },
      firmName: { type: "string", minLength: 1, maxLength: 200 },
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 8 },
      idToken: { type: "string" },
      rcNumber: { type: "string", minLength: 3, maxLength: 32 },
      firmEstablishmentYear: { type: "integer", minimum: 1800, maximum: 2100 },
      verifyingPartnerScn: { type: "string", maxLength: 32 },
      practiceAreaIds: {
        type: "array",
        minItems: 1,
        items: { type: "string", format: "uuid" },
      },
      feeRangeMin: { type: "integer", minimum: 0 },
      feeRangeMax: { type: "integer", minimum: 0 },
      locationCity: { type: "string", minLength: 1, maxLength: 80 },
      locationCountry: { type: "string", maxLength: 80 },
    },
  },
};

export const loginSchema = {
  body: {
    type: "object",
    required: ["authProvider"],
    properties: {
      authProvider: { type: "string", enum: ["email", "google"] },
      email: { type: "string", format: "email" },
      password: { type: "string" },
      idToken: { type: "string" },
    },
  },
};

export const refreshSchema = {
  body: {
    type: "object",
    required: ["refreshToken"],
    properties: { refreshToken: { type: "string" } },
  },
};

export const forgotPasswordSchema = {
  body: {
    type: "object",
    required: ["email"],
    properties: { email: { type: "string", format: "email" } },
  },
};

export const resetPasswordSchema = {
  body: {
    type: "object",
    required: ["token", "newPassword"],
    properties: {
      token: { type: "string" },
      newPassword: { type: "string", minLength: 8 },
    },
  },
};
