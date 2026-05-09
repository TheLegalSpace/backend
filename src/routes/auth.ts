import { FastifyInstance } from "fastify";
import {
  registerUser,
  registerLawyer,
  registerFirm,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  deleteAccount,
} from "../controller/auth";
import {
  registerUserSchema,
  registerLawyerSchema,
  registerFirmSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../dto/auth";
import { authHook } from "../middleware/auth";

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/register/user", { schema: registerUserSchema }, registerUser);
  fastify.post("/register/lawyer", { schema: registerLawyerSchema }, registerLawyer);
  fastify.post("/register/firm", { schema: registerFirmSchema }, registerFirm);
  fastify.post("/login", { schema: loginSchema }, login);
  fastify.post("/refresh", { schema: refreshSchema }, refresh);
  fastify.post("/forgot-password", { schema: forgotPasswordSchema }, forgotPassword);
  fastify.post("/reset-password", { schema: resetPasswordSchema }, resetPassword);

  fastify.register(async (authed) => {
    authed.addHook("onRequest", authHook);
    authed.post("/logout", logout);
    authed.delete("/account", deleteAccount);
  });
}
