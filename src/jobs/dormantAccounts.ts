import cron from "node-cron";
import { prisma } from "../config/database";

export const startDormantAccountJob = () => {
  cron.schedule("0 3 * * *", async () => {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await prisma.account.updateMany({
      where: { status: "active", lastActiveAt: { lt: cutoff } },
      data: { status: "dormant" },
    });
    console.log(`[cron] flagged ${result.count} dormant accounts`);
  });
};
