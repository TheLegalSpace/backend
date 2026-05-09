import { Worker } from "bullmq";
import { bullConnection, redis } from "../config/redis";
import { createNotification } from "../dao/notification";
import { emitToAccount } from "../realtime/emitter";

export const startNotificationFanoutWorker = () => {
  const worker = new Worker(
    "notifications-fanout",
    async (job) => {
      const { recipientAccountId, type, payload } = job.data as {
        recipientAccountId: string;
        type: string;
        payload: any;
      };
      const notif = await createNotification({
        recipientAccountId,
        type,
        payload,
      });
      emitToAccount(recipientAccountId, "notification", notif);
      await redis.del(`notif:unread:${recipientAccountId}`).catch(() => null);
      return notif;
    },
    { connection: bullConnection }
  );
  worker.on("failed", (_job, err) => {
    console.error("[notifications:fanout] failed:", err.message);
  });
  return worker;
};
