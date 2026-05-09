import { Queue } from "bullmq";
import { bullConnection } from "../config/redis";
import { NotificationType } from "../interface";

export const notificationFanoutQueue = new Queue("notifications-fanout", {
  connection: bullConnection,
  defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 1000 },
});

export const notificationDigestQueue = new Queue("notifications-digest", {
  connection: bullConnection,
  defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 1000 },
});

export interface EnqueueNotificationInput {
  recipientAccountId: string;
  type: NotificationType;
  payload: Record<string, any>;
  emailable?: boolean;
}

export const enqueueNotification = async (data: EnqueueNotificationInput) => {
  try {
    await notificationFanoutQueue.add("create", data);
  } catch (err) {
    console.error("[notification] enqueue failed:", (err as Error).message);
  }
};
