import { Worker } from "bullmq";
import { bullConnection } from "../config/redis";
import { prisma } from "../config/database";

export const startNotificationDigestWorker = () => {
  const worker = new Worker(
    "notifications-digest",
    async () => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recipients = await prisma.notification.groupBy({
        by: ["recipientAccountId"],
        where: { readAt: null, emailedAt: null, createdAt: { lt: cutoff } },
        _count: { _all: true },
      });
      for (const r of recipients) {
        const items = await prisma.notification.findMany({
          where: {
            recipientAccountId: r.recipientAccountId,
            readAt: null,
            emailedAt: null,
            createdAt: { lt: cutoff },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        });
        // Email send placeholder — Brevo integration would go here.
        console.log(
          `[digest] would email ${r.recipientAccountId} with ${items.length} items`
        );
        await prisma.notification.updateMany({
          where: { id: { in: items.map((i) => i.id) } },
          data: { emailedAt: new Date() },
        });
      }
      return recipients.length;
    },
    { connection: bullConnection }
  );
  worker.on("failed", (_job, err) => {
    console.error("[notifications:digest] failed:", err.message);
  });
  return worker;
};
