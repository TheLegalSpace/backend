import { prisma } from "../config/database";

// Upsert on the unique endpoint. Re-enabling on the same device updates keys /
// ownership instead of creating a duplicate row.
export const upsertPushSubscription = async (data: {
  accountId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceType?: string | null;
  userAgent?: string | null;
}) => {
  return prisma.pushSubscription.upsert({
    where: { endpoint: data.endpoint },
    create: {
      accountId: data.accountId,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      deviceType: data.deviceType ?? null,
      userAgent: data.userAgent ?? null,
    },
    update: {
      accountId: data.accountId,
      p256dh: data.p256dh,
      auth: data.auth,
      deviceType: data.deviceType ?? null,
      userAgent: data.userAgent ?? null,
    },
  });
};

export const listPushSubscriptionsByAccount = async (accountId: string) => {
  return prisma.pushSubscription.findMany({ where: { accountId } });
};

// Scoped to the account so one user can't remove another's device.
export const deletePushSubscriptionByEndpoint = async (
  accountId: string,
  endpoint: string
) => {
  return prisma.pushSubscription.deleteMany({ where: { accountId, endpoint } });
};

// Used by the send path to prune a dead endpoint (404/410 from the push service).
export const deletePushSubscriptionById = async (id: string) => {
  return prisma.pushSubscription.deleteMany({ where: { id } });
};
