import { FastifyReply, FastifyRequest } from "fastify";

// Gates routes behind an active Professional membership. Reads the denormalized
// `membershipTier` on the account loaded by the auth hook (kept in sync on
// activate/expire), so no extra query is needed.
export const requireProfessional = async (req: FastifyRequest, reply: FastifyReply) => {
  const account = req.account;
  if (!account) {
    return reply.status(401).send({ error: true, message: "Unauthorized" });
  }
  if (account.membershipTier !== "professional") {
    return reply.status(403).send({
      error: true,
      message: "Professional membership required",
    });
  }
};
