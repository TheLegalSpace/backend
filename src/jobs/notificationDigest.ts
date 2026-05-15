import cron from "node-cron";
import { runDailyDigest } from "../services/notification";

export const startNotificationDigestJob = () => {
  cron.schedule("0 8 * * *", async () => {
    try {
      const count = await runDailyDigest();
      console.log(`[cron] notification digest processed ${count} recipients`);
    } catch (err) {
      console.error("[cron] notification digest failed:", (err as Error).message);
    }
  });
};
