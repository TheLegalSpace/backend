import { FastifyReply, FastifyRequest } from "fastify";

// Blocks LAWYER/FIRM accounts that picked their account type during onboarding
// but haven't completed profile setup yet (no satellite profile row). Reads the
// satellites already loaded by the auth hook, so no extra query is needed.
// Other roles pass through — pair with requireRole where needed.
export const requireCompletedProfile = async (req: FastifyRequest, reply: FastifyReply) => {
  const account = req.account;
  if (!account) {
    return reply.status(401).send({ error: true, message: "Unauthorized" });
  }
  const incomplete =
    (account.role === "LAWYER" && !account.lawyerProfile) ||
    (account.role === "FIRM" && !account.firmProfile);
  if (incomplete) {
    return reply.status(403).send({
      error: true,
      message: "Complete your profile setup before performing this action",
    });
  }
};
