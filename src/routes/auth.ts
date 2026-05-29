import { FastifyInstance } from "fastify";
import {
  registerStart,
  registerResend,
  registerVerify,
  registerGoogle,
  login,
  refresh,
  logout,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  deleteAccount,
} from "../controller/auth";
import {
  registerStartSchema,
  registerResendSchema,
  registerVerifySchema,
  registerGoogleSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  verifyResetCodeSchema,
  resetPasswordSchema,
} from "../dto/auth";
import { authHook } from "../middleware/auth";

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/register/start", { schema: registerStartSchema }, registerStart);
  fastify.post("/register/resend", { schema: registerResendSchema }, registerResend);
  fastify.post("/register/verify", { schema: registerVerifySchema }, registerVerify);
  fastify.post("/register/google", { schema: registerGoogleSchema }, registerGoogle);
  fastify.post("/login", { schema: loginSchema }, login);
  fastify.post("/refresh", { schema: refreshSchema }, refresh);
  fastify.post("/forgot-password", { schema: forgotPasswordSchema }, forgotPassword);
  fastify.post("/verify-reset-code", { schema: verifyResetCodeSchema }, verifyResetCode);
  fastify.post("/reset-password", { schema: resetPasswordSchema }, resetPassword);

  fastify.register(async (authed) => {
    authed.addHook("onRequest", authHook);
    authed.post("/logout", logout);
    authed.delete("/account", deleteAccount);
  });
}
