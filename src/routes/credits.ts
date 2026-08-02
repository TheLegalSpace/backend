import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import {
  getCredits,
  listPacks,
  listTransactions,
  purchaseCredits,
  verifyCreditPurchase,
} from "../controller/credits";
import { purchaseBodySchema, verifyQuerySchema, transactionsQuerySchema } from "../dto/credits";

// Research credits are a Professional (lawyer/firm) concern — clients don't use
// TLS Research. Mounted at /credits.
export default async function creditRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);
  fastify.addHook("preHandler", requireRole("LAWYER", "FIRM"));

  fastify.get("/", getCredits);
  fastify.get("/packs", listPacks);
  fastify.get("/transactions", { schema: transactionsQuerySchema }, listTransactions);
  fastify.post("/purchase", { schema: purchaseBodySchema }, purchaseCredits);
  fastify.get("/verify", { schema: verifyQuerySchema }, verifyCreditPurchase);
}
