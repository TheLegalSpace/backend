import cron from "node-cron";
import {
  upsertDailyStats,
  countActiveSince,
  countNewAccountsBetween,
} from "../dao/analytics";

// Snapshots active-user counts once a day so the admin Analytics page has real
// DAU/MAU trends. Note: history only accumulates from the day this ships —
// there is no way to backfill days before the first snapshot.
const runSnapshot = async () => {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [dau, mau, newUsers] = await Promise.all([
    countActiveSince(dayAgo),
    countActiveSince(monthAgo),
    countNewAccountsBetween(startOfToday, now),
  ]);

  // Key the row by date (midnight) so re-runs within a day overwrite, not duplicate.
  await upsertDailyStats(startOfToday, { dau, mau, newUsers });
  console.log(`[cron] daily stats: dau=${dau} mau=${mau} newUsers=${newUsers}`);
};

export const startDailyStatsJob = () => {
  // 23:50 UTC — near end of day so DAU reflects the full day's activity.
  cron.schedule("50 23 * * *", () => {
    runSnapshot().catch((err) => console.error("[cron] daily stats failed:", err?.message));
  });
};
