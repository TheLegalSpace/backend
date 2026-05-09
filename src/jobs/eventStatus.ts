import cron from "node-cron";
import { prisma } from "../config/database";

export const startEventStatusJob = () => {
  cron.schedule("0 1 * * *", async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await prisma.event.updateMany({
      where: {
        status: "published",
        endAt: { lt: cutoff, not: null },
      },
      data: { status: "past" },
    });
    console.log(`[cron] flipped ${result.count} events to past`);
  });
};
