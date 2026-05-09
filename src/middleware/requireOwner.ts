import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../config/database";

type Resource = "post" | "article" | "request" | "event";

const fetchOwner = async (resource: Resource, id: string): Promise<string | null> => {
  switch (resource) {
    case "post": {
      const r = await prisma.post.findUnique({ where: { id }, select: { authorAccountId: true } });
      return r?.authorAccountId ?? null;
    }
    case "article": {
      const r = await prisma.article.findUnique({ where: { id }, select: { authorAccountId: true } });
      return r?.authorAccountId ?? null;
    }
    case "request": {
      const r = await prisma.request.findUnique({ where: { id }, select: { userAccountId: true } });
      return r?.userAccountId ?? null;
    }
    case "event": {
      const r = await prisma.event.findUnique({ where: { id }, select: { createdByAdminId: true } });
      return r?.createdByAdminId ?? null;
    }
  }
};

export const requireOwner = (resource: Resource, idParam = "id") => {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const params = req.params as Record<string, string>;
    const resourceId = params[idParam];
    if (!resourceId) {
      return reply.status(400).send({ error: true, message: `Missing ${idParam} in path` });
    }
    const ownerId = await fetchOwner(resource, resourceId);
    if (!ownerId) {
      return reply.status(404).send({ error: true, message: `${resource} not found` });
    }
    if (ownerId !== req.account?.id) {
      return reply.status(403).send({ error: true, message: "Forbidden — not the owner" });
    }
  };
};
