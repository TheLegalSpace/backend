import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../config/database";

export const requireConversationParticipant = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  const params = req.params as Record<string, string>;
  const conversationId = params.id || params.conversationId;
  if (!conversationId) {
    return reply.status(400).send({ error: true, message: "Missing conversation id" });
  }
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, userAccountId: true, lawyerAccountId: true, status: true },
  });
  if (!conversation) {
    return reply.status(404).send({ error: true, message: "Conversation not found" });
  }
  const me = req.account?.id;
  if (conversation.userAccountId !== me && conversation.lawyerAccountId !== me) {
    return reply.status(403).send({ error: true, message: "Not a participant in this conversation" });
  }
  // Archived = our safe-delete after 14 days of inactivity. To the user the chat
  // is "deleted" — every conversation-scoped route returns 410 Gone (data is
  // retained on our side for audit/disputes, but unreachable from the UI).
  if (conversation.status === "archived") {
    return reply.status(410).send({
      error: true,
      message:
        "This conversation was deleted after 14 days of inactivity and is no longer available",
    });
  }
  (req as any).conversation = conversation;
};
