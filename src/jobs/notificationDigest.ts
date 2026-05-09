import cron from "node-cron";
import { notificationDigestQueue } from "../services/notification";

export const startNotificationDigestJob = () => {
  cron.schedule("0 8 * * *", async () => {
    await notificationDigestQueue.add("send", {});
    console.log("[cron] notification digest scheduled");
  });
};
