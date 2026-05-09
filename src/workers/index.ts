import { startNotificationFanoutWorker } from "./notificationFanout";
import { startNotificationDigestWorker } from "./notificationDigest";

const fanout = startNotificationFanoutWorker();
const digest = startNotificationDigestWorker();

console.log("[workers] started");

const shutdown = async () => {
  await fanout.close();
  await digest.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
