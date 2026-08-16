import cron from "node-cron";
import { prisma } from "../config/database";
import { dispatchNotification } from "../services/notification";
import { matterNameOf } from "../logic/request";
import { releaseBatchIfSettled } from "../dao/matchOffer";

export const startStaleRequestJob = () => {
  cron.schedule("0 * * * *", async () => {
    const now = new Date();

    // 1. Warn before expiry: pending requests due to expire within the next 24h
    //    that haven't been warned yet. Nudges the user (and lawyer) to act.
    const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const expiring = await prisma.request.findMany({
      where: {
        status: "pending",
        expiryWarningSentAt: null,
        expiresAt: { gt: now, lte: soon },
      },
      select: {
        id: true,
        userAccountId: true,
        lawyerAccountId: true,
        expiresAt: true,
        intakePayload: true,
      },
    });
    if (expiring.length > 0) {
      await prisma.request.updateMany({
        where: { id: { in: expiring.map((r) => r.id) } },
        data: { expiryWarningSentAt: now },
      });
      for (const r of expiring) {
        // The user owns the request; the lawyer is nudged to respond before it lapses.
        // Each side sees the other party's name plus what the matter was about.
        const matterName = await matterNameOf(r.intakePayload);
        await dispatchNotification({
          recipientAccountId: r.userAccountId,
          type: "request_expiring",
          payload: {
            requestId: r.id,
            expiresAt: r.expiresAt,
            actorAccountId: r.lawyerAccountId,
            matterName,
          },
        });
        await dispatchNotification({
          recipientAccountId: r.lawyerAccountId,
          type: "request_expiring",
          payload: {
            requestId: r.id,
            expiresAt: r.expiresAt,
            actorAccountId: r.userAccountId,
            matterName,
          },
        });
      }
      console.log(`[cron] warned ${expiring.length} requests about to expire`);
    }

    // 2. Expire requests past their deadline.
    const stale = await prisma.request.findMany({
      where: { status: "pending", expiresAt: { lt: now } },
      select: {
        id: true,
        userAccountId: true,
        lawyerAccountId: true,
        intakePayload: true,
      },
    });
    if (stale.length === 0) return;
    await prisma.request.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { status: "expired" },
    });
    for (const s of stale) {
      // The lawyer never answered, so the client should not be left sitting out
      // the match cooldown on the strength of it — release the offer that
      // produced this request and give the slot back.
      await releaseBatchIfSettled(s.id).catch((err) =>
        console.error("[cron] failed to release offer on expiry:", (err as Error).message)
      );
      await dispatchNotification({
        recipientAccountId: s.userAccountId,
        type: "request_expired",
        payload: {
          requestId: s.id,
          actorAccountId: s.lawyerAccountId,
          matterName: await matterNameOf(s.intakePayload),
        },
      });
    }
    console.log(`[cron] expired ${stale.length} stale requests`);
  });
};
