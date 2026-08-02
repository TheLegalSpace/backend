import cron from "node-cron";
import { prisma } from "../config/database";
import { dispatchNotification } from "../services/notification";
import { env } from "../config/env";

// Nudges for unanswered messages in active conversations:
//  - 1h: the latest message has gone unread for over an hour -> remind the recipient (in-app).
//  - 3h: a *client* (USER) message has gone unread by the lawyer/firm for over
//        three hours -> in-app + WhatsApp escalation.
// In a Conversation, userAccountId is always the USER (client) and
// lawyerAccountId is always the LAWYER/FIRM, so we derive sender/recipient
// without extra role lookups. Per-message markers (reset on every new message)
// stop the same nudge firing every tick.
const ONE_HOUR_MS = 60 * 60 * 1000;
const THREE_HOURS_MS = 3 * ONE_HOUR_MS;

export const startConversationReminderJob = () => {
  cron.schedule("*/15 * * * *", async () => {
    const now = Date.now();
    const oneHourAgo = new Date(now - ONE_HOUR_MS);

    // Active conversations whose last activity is at least an hour old.
    const conversations = await prisma.conversation.findMany({
      where: { status: "active", lastMessageAt: { lte: oneHourAgo } },
      select: {
        id: true,
        userAccountId: true,
        lawyerAccountId: true,
        reminder1hSentForMessageId: true,
        reminder3hSentForMessageId: true,
      },
    });
    if (conversations.length === 0) return;

    let reminded1h = 0;
    let reminded3h = 0;

    for (const c of conversations) {
      const latest = await prisma.message.findFirst({
        where: { conversationId: c.id },
        orderBy: { createdAt: "desc" },
      });
      // Nothing to chase if there's no message or it's already been read.
      if (!latest || latest.readAt) continue;

      const ageMs = now - latest.createdAt.getTime();
      const recipientId =
        latest.senderAccountId === c.userAccountId
          ? c.lawyerAccountId
          : c.userAccountId;
      const isClientMessage = latest.senderAccountId === c.userAccountId;

      // 1-hour reply reminder (in-app, either direction).
      if (ageMs >= ONE_HOUR_MS && c.reminder1hSentForMessageId !== latest.id) {
        await dispatchNotification({
          recipientAccountId: recipientId,
          type: "reply_reminder",
          payload: {
            conversationId: c.id,
            messageId: latest.id,
            actorAccountId: latest.senderAccountId,
            snippet: latest.body.slice(0, 80),
          },
        });
        await prisma.conversation.update({
          where: { id: c.id },
          data: { reminder1hSentForMessageId: latest.id },
        });
        reminded1h++;
      }

      // 3-hour unread client-message escalation (in-app + WhatsApp to the lawyer/firm).
      if (
        isClientMessage &&
        ageMs >= THREE_HOURS_MS &&
        c.reminder3hSentForMessageId !== latest.id
      ) {
        await dispatchNotification({
          recipientAccountId: c.lawyerAccountId,
          type: "unread_client_message",
          payload: {
            conversationId: c.id,
            messageId: latest.id,
            actorAccountId: c.userAccountId,
            snippet: latest.body.slice(0, 80),
          },
          channels: ["in_app", "whatsapp"],
          whatsapp: {
            template: env.whatsappUnreadTemplate,
            params: [latest.body.slice(0, 60)],
          },
        });
        await prisma.conversation.update({
          where: { id: c.id },
          data: { reminder3hSentForMessageId: latest.id },
        });
        reminded3h++;
      }
    }

    if (reminded1h || reminded3h) {
      console.log(
        `[cron] conversation reminders: 1h=${reminded1h}, 3h=${reminded3h}`
      );
    }
  });
};
