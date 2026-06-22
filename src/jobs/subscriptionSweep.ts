import cron from "node-cron";
import {
  findExpiredSubscriptions,
  findSubscriptionsExpiringSoon,
  updateSubscription,
  setAccountMembership,
} from "../dao/membership";
import { dispatchNotification } from "../services/notification";
import { invalidateAccountCache } from "../middleware/auth";

const DAY_MS = 24 * 60 * 60 * 1000;

// Daily at 01:00 — expire lapsed subscriptions (downgrade to community) and warn
// accounts whose period ends within ~7 days.
export const startSubscriptionSweepJob = () => {
  cron.schedule("0 1 * * *", async () => {
    const now = new Date();

    // 1) Expire subscriptions that lapsed (non-renewing/cancelled/past-due past period end).
    const expired = await findExpiredSubscriptions(now);
    for (const sub of expired) {
      await updateSubscription(sub.id, { status: "expired", autoRenew: false });
      await setAccountMembership(sub.accountId, "community", null);
      if (sub.account?.authUserId) await invalidateAccountCache(sub.account.authUserId);
      await dispatchNotification({
        recipientAccountId: sub.accountId,
        type: "subscription_expired",
        payload: {},
        emailable: true,
      });
    }

    // 2) Warn subscriptions expiring within the next 7 days.
    const soon = await findSubscriptionsExpiringSoon(now, new Date(now.getTime() + 7 * DAY_MS));
    for (const sub of soon) {
      await dispatchNotification({
        recipientAccountId: sub.accountId,
        type: "subscription_expiring_soon",
        payload: { currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null },
        emailable: true,
      });
    }

    console.log(
      `[cron] subscription sweep: expired ${expired.length}, expiring-soon ${soon.length}`
    );
  });
};
