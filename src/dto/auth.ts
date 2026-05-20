export const registerStartSchema = {
  body: {
    type: "object",
    required: ["email", "password", "role"],
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 8 },
      role: { type: "string", enum: ["USER", "LAWYER", "FIRM"] },
    },
  },
};

export const registerVerifySchema = {
  body: {
    type: "object",
    required: ["email", "otp"],
    properties: {
      email: { type: "string", format: "email" },
      otp: { type: "string", minLength: 4, maxLength: 10 },
    },
  },
};

export const registerResendSchema = {
  body: {
    type: "object",
    required: ["email"],
    properties: {
      email: { type: "string", format: "email" },
    },
  },
};

export const registerGoogleSchema = {
  body: {
    type: "object",
    required: ["idToken", "role"],
    properties: {
      idToken: { type: "string", minLength: 10 },
      role: { type: "string", enum: ["USER", "LAWYER", "FIRM"] },
      fullName: { type: "string", maxLength: 100 },
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
