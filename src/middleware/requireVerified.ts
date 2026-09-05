import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env";

/**
 * Gates routes that should require a cleared KYC review.
 *
 * KYC ENFORCEMENT TODO — currently permissive by design.
 *
 * Professional setup writes `verificationStatus: "pending"` and the required
 * document upload moves it to `under_review`, which is what populates
 * `GET /admin/kyc/queue`. Enforcing on that status immediately would strand
 * every new signup until an admin approves them, and nobody is working the
 * queue yet. So while `KYC_ENFORCEMENT_ENABLED` is false this logs and passes.
 *
 * Flip `KYC_ENFORCEMENT_ENABLED=true` once the queue is staffed — no code change
 * needed. Applies to `POST /leads/:id/accept` today.
 */
export const requireVerified = async (req: FastifyRequest, reply: FastifyReply) => {
  const account = req.account;
  if (!account) {
    return reply.status(401).send({ error: true, message: "Unauthorized" });
  }
  const status =
    account.lawyerProfile?.verificationStatus ||
    account.firmProfile?.verificationStatus ||
    "verified";

  if (status === "verified") return;

  if (!env.kycEnforcementEnabled) {
    console.warn(
      `[kyc] allowing unverified account through ${req.method} ${req.url} ` +
        `account=${account.id} status=${status} (KYC_ENFORCEMENT_ENABLED=false)`
    );
    return;
  }

  return reply.status(403).send({
    error: true,
    message:
      status === "rejected"
        ? "Your professional verification was rejected. Contact support to appeal."
        : "Your profile is still under review. You'll be notified once verification is complete.",
  });
};
