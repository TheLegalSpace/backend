import { FastifyReply, FastifyRequest } from "fastify";
import { Role } from "../interface";

export const requireRole = (...allowed: Role[]) => {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const role = req.account?.role as Role | undefined;
    if (!role || !allowed.includes(role)) {
      return reply.status(403).send({
        error: true,
        message: `Forbidden — requires role ${allowed.join("/")}`,
      });
    }
  };
};
