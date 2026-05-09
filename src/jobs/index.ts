import { startStaleRequestJob } from "./staleRequests";
import { startTopAccountsJob } from "./topAccounts";
import { startDormantAccountJob } from "./dormantAccounts";
import { startEventStatusJob } from "./eventStatus";
import { startNotificationDigestJob } from "./notificationDigest";

startStaleRequestJob();
startTopAccountsJob();
startDormantAccountJob();
startEventStatusJob();
startNotificationDigestJob();

console.log("[jobs] cron schedule started");

const shutdown = () => process.exit(0);
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
