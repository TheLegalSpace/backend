import cron from "node-cron";
import { prisma } from "../config/database";
import { dispatchNotification } from "../services/notification";

export const startStaleRequestJob = () => {
  cron.schedule("0 * * * *", async () => {
    const now = new Date();
    const stale = await prisma.request.findMany({
      where: { status: "pending", expiresAt: { lt: now } },
      select: { id: true, userAccountId: true },
    });
    if (stale.length === 0) return;
    await prisma.request.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { status: "expired" },
    });
    for (const s of stale) {
      await dispatchNotification({
        recipientAccountId: s.userAccountId,
        type: "request_expired",
        payload: { requestId: s.id },
      });
    }
    console.log(`[cron] expired ${stale.length} stale requests`);
  });
};
