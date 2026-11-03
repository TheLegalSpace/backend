import { FastifyInstance } from "fastify";
import { verifyWebhookSignature } from "../services/paystack";
import { handlePaystackEvent } from "../logic/membership";

// Mounted unprefixed at /webhooks, OUTSIDE the API prefix and WITHOUT authHook —
// Paystack cannot send a Bearer token. Verification is by HMAC signature instead.
export default async function webhookRoutes(fastify: FastifyInstance) {
  // Encapsulated raw-body parser: keep the raw bytes for HMAC, still parse JSON.
  // Scoped to this plugin so the main API's JSON parsing is unaffected.
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      (_req as any).rawBody = body;
      try {
        done(null, JSON.parse(body.toString("utf8")));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  fastify.post("/paystack", async (req, reply) => {
    const signature = req.headers["x-paystack-signature"] as string | undefined;
    const raw = (req as any).rawBody as Buffer;
    if (!verifyWebhookSignature(raw, signature)) {
      return reply.status(401).send({ error: true, message: "Invalid signature" });
    }

    const evt = req.body as { event?: string; data?: any };
    // A failed handler answers 500 so Paystack redelivers. Acknowledging it would
    // drop a charge the customer has already paid — and every handler is
    // idempotent on the payment reference, so a retry can't double-apply.
    // `jobs/paymentReconciliation.ts` is the backstop if retries run out.
    try {
      if (evt?.event) await handlePaystackEvent(evt.event, evt.data);
    } catch (err: any) {
      console.error(
        `[webhook] handler error event=${evt?.event} reference=${evt?.data?.reference}:`,
        err?.message
      );
      return reply.status(500).send({ received: false });
    }
    return reply.status(200).send({ received: true });
  });
}
