import { prisma } from "../config/database";

// Pure Prisma over CreditWallet / CreditTransaction. All balance mutations go
// through creditWallet()/spendFromWallet() so the ledger stays in lock-step with
// the balance inside a single transaction.

export const getWallet = async (accountId: string) =>
  prisma.creditWallet.findUnique({ where: { accountId } });

export const getOrCreateWallet = async (accountId: string) =>
  prisma.creditWallet.upsert({
    where: { accountId },
    create: { accountId, balance: 0 },
    update: {},
  });

// Add credits (grant/purchase/refund/adjustment) and record a ledger row atomically.
export const creditWallet = async (input: {
  accountId: string;
  amount: number; // positive
  type: string;
  reference?: string | null;
  metadata?: any;
  stampMonthlyGrant?: boolean;
}) =>
  prisma.$transaction(async (tx) => {
    const wallet = await tx.creditWallet.upsert({
      where: { accountId: input.accountId },
      create: {
        accountId: input.accountId,
        balance: input.amount,
        lastMonthlyGrantAt: input.stampMonthlyGrant ? new Date() : null,
      },
      update: {
        balance: { increment: input.amount },
        ...(input.stampMonthlyGrant ? { lastMonthlyGrantAt: new Date() } : {}),
      },
    });
    await tx.creditTransaction.create({
      data: {
        accountId: input.accountId,
        type: input.type,
        amount: input.amount,
        balanceAfter: wallet.balance,
        reference: input.reference ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
    return wallet;
  });

// Atomically spend if the balance suffices. Returns the updated wallet, or null
// when there aren't enough credits (the conditional update matched no row).
export const spendFromWallet = async (input: {
  accountId: string;
  amount: number; // positive
  reference?: string | null;
  metadata?: any;
}) =>
  prisma.$transaction(async (tx) => {
    const res = await tx.creditWallet.updateMany({
      where: { accountId: input.accountId, balance: { gte: input.amount } },
      data: { balance: { decrement: input.amount } },
    });
    if (res.count === 0) return null; // insufficient balance
    const wallet = await tx.creditWallet.findUnique({ where: { accountId: input.accountId } });
    await tx.creditTransaction.create({
      data: {
        accountId: input.accountId,
        type: "spend",
        amount: -input.amount,
        balanceAfter: wallet!.balance,
        reference: input.reference ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
    return wallet;
  });

// Any ledger row with this reference — used to make purchase crediting idempotent
// (Paystack references are globally unique).
export const findTransactionByReference = async (reference: string) =>
  prisma.creditTransaction.findFirst({ where: { reference } });

// Account-scoped lookup — used to make the monthly grant idempotent per month.
export const findAccountTransaction = async (
  accountId: string,
  reference: string,
  type?: string
) =>
  prisma.creditTransaction.findFirst({
    where: { accountId, reference, ...(type ? { type } : {}) },
  });

export const recentTransactions = async (accountId: string, take = 10) =>
  prisma.creditTransaction.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take,
  });

export const listTransactions = async (accountId: string, skip: number, take: number) => {
  const where = { accountId };
  const [items, total] = await Promise.all([
    prisma.creditTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.creditTransaction.count({ where }),
  ]);
  return { items, total };
};
