import cron from "node-cron";
import { prisma } from "../config/database";
import { redis } from "../config/redis";

const recompute = async (role: "LAWYER" | "FIRM") => {
  const accounts = await prisma.account.findMany({
    where: { role, status: "active" },
    orderBy: [{ avgRating: "desc" }, { reviewCount: "desc" }],
    take: 50,
    select: { id: true },
  });
  await redis.set(
    `topAccounts:${role}`,
    JSON.stringify(accounts.map((a) => a.id)),
    "EX",
    24 * 60 * 60
  );
};

export const startTopAccountsJob = () => {
  cron.schedule("0 2 * * *", async () => {
    await recompute("LAWYER");
    await recompute("FIRM");
    console.log("[cron] top-accounts recomputed");
  });
};
