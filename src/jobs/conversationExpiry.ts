import cron from "node-cron";
import { prisma } from "../config/database";
import { dispatchNotification } from "../services/notification";

// A conversation auto-archives after 14 days of inactivity (no new message).
// Sending a message resets lastMessageAt, which re-arms the clock. Participants
// are warned 1–2 days before (i.e. once the idle streak crosses 12 days).
const INACTIVITY_DAYS = 14;
const WARN_DAYS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

// Inactivity is measured from the last message, or from creation if no message
// has been sent yet.
const referenceTime = (c: { lastMessageAt: Date | null; createdAt: Date }) =>
  c.lastMessageAt ?? c.createdAt;

export const startConversationExpiryJob = () => {
  cron.schedule("0 * * * *", async () => {
    const now = Date.now();
    const archiveBefore = new Date(now - INACTIVITY_DAYS * DAY_MS);
    const warnBefore = new Date(now - WARN_DAYS * DAY_MS);

    // Active conversations idle for at least WARN_DAYS (covers both warn + archive).
    const candidates = await prisma.conversation.findMany({
      where: {
        status: "active",
        OR: [
          { lastMessageAt: { lte: warnBefore } },
          { lastMessageAt: null, createdAt: { lte: warnBefore } },
        ],
      },
      select: {
        id: true,
        userAccountId: true,
        lawyerAccountId: true,
        lastMessageAt: true,
        createdAt: true,
        expiryWarningSentAt: true,
      },
    });

    let archived = 0;
    let warned = 0;

    for (const c of candidates) {
      const ref = referenceTime(c);

      if (ref <= archiveBefore) {
        // Past the 14-day mark — archive (reversible status flip, data retained).
        await prisma.conversation.update({
          where: { id: c.id },
          data: { status: "archived", archivedAt: new Date() },
        });
        archived++;
        continue;
      }

      // Between 12 and 14 days idle — send the one-time "about to delete" warning.
      if (!c.expiryWarningSentAt) {
        const expiresAt = new Date(ref.getTime() + INACTIVITY_DAYS * DAY_MS);
        for (const recipient of [c.userAccountId, c.lawyerAccountId]) {
          await dispatchNotification({
            recipientAccountId: recipient,
            type: "chat_expiring",
            payload: {
              conversationId: c.id,
              expiresAt,
              // The other participant — "your conversation with X".
              actorAccountId:
                recipient === c.userAccountId ? c.lawyerAccountId : c.userAccountId,
            },
          });
        }
        await prisma.conversation.update({
          where: { id: c.id },
          data: { expiryWarningSentAt: new Date() },
        });
        warned++;
      }
    }

    if (archived || warned) {
      console.log(`[cron] conversations: archived ${archived}, expiry-warned ${warned}`);
    }
  });
};
