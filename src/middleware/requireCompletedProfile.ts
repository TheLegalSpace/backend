import { FastifyReply, FastifyRequest } from "fastify";

// Blocks LAWYER/FIRM accounts that are still mid-onboarding.
//
// The signal is `Account.profileCompletedAt`, NOT the presence of a satellite
// profile: the satellite is now created back at the bar-details step, long
// before practice areas and fees are collected, so its existence no longer
// means the wizard finished. Reads the account already loaded by the auth hook,
// so no extra query is needed. Other roles pass through — pair with requireRole
// where needed.
export const requireCompletedProfile = async (req: FastifyRequest, reply: FastifyReply) => {
  const account = req.account;
  if (!account) {
    return reply.status(401).send({ error: true, message: "Unauthorized" });
  }
  const isProfessional = account.role === "LAWYER" || account.role === "FIRM";
  const incomplete = isProfessional && !account.profileCompletedAt;
  if (incomplete) {
    return reply.status(403).send({
      error: true,
      message: "Complete your profile setup before performing this action",
    });
  }
};
