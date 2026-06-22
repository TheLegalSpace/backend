import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import {
  getMembership,
  getPlans,
  subscribe,
  verifyPayment,
  setAutoRenew,
  cancelRenewal,
  updatePaymentMethod,
  listInvoices,
  downloadInvoice,
} from "../controller/membership";
import {
  verifyQuerySchema,
  autoRenewBodySchema,
  invoicesQuerySchema,
  invoiceIdParamSchema,
} from "../dto/membership";

export default async function membershipRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);
  fastify.addHook("preHandler", requireRole("LAWYER", "FIRM"));

  fastify.get("/", getMembership);
  fastify.get("/plans", getPlans);
  fastify.post("/subscribe", subscribe);
  fastify.get("/verify", { schema: verifyQuerySchema }, verifyPayment);
  fastify.patch("/auto-renew", { schema: autoRenewBodySchema }, setAutoRenew);
  fastify.post("/cancel", cancelRenewal);
  fastify.post("/payment-method/update", updatePaymentMethod);
  fastify.get("/invoices", { schema: invoicesQuerySchema }, listInvoices);
  fastify.get("/invoices/:id/download", { schema: invoiceIdParamSchema }, downloadInvoice);
}
