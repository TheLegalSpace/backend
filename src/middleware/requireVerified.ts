import { FastifyReply, FastifyRequest } from "fastify";

export const requireVerified = async (req: FastifyRequest, reply: FastifyReply) => {
  const account = req.account;
  if (!account) {
    return reply.status(401).send({ error: true, message: "Unauthorized" });
  }
  const status =
    account.lawyerProfile?.verificationStatus ||
    account.firmProfile?.verificationStatus ||
    "verified";
  if (status !== "verified") {
    return reply.status(403).send({ error: true, message: "Account not verified" });
  }
};
