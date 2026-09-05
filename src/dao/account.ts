import { prisma } from "../config/database";
import { Prisma } from "@prisma/client";
import { purgeAfterFor, DELETED_ACCOUNT_NAME } from "../config/accountDeletion";

export const findAccountByAuthUserId = async (authUserId: string) => {
  return prisma.account.findUnique({
    where: { authUserId },
    include: {
      lawyerProfile: true,
      firmProfile: true,
      practiceAreaLinks: { include: { practiceArea: true } },
    },
  });
};

export const findAccountById = async (id: string) => {
  return prisma.account.findUnique({
    where: { id },
    include: {
      lawyerProfile: true,
      firmProfile: true,
      practiceAreaLinks: { include: { practiceArea: true } },
    },
  });
};

export const findAccountByEmail = async (email: string) => {
  return prisma.account.findUnique({ where: { email } });
};

export const updateAccount = async (id: string, data: Prisma.AccountUpdateInput) => {
  return prisma.account.update({ where: { id }, data });
};

/**
 * Deactivate an account and archive who it belonged to.
 *
 * Deletion here is "hidden", not "gone": the row, the posts, the reviews, the
 * messages and the satellite profiles all stay. What moves is the contact and
 * identity data — it is copied into `account_deletion_records` and then scrubbed
 * off the live row, because (a) the unique index on `email` would otherwise stop
 * that person ever registering again, and (b) the live row is spread across
 * responses by every `include: { author: true }`, so anything left on it leaks
 * to a profile that is supposed to be hidden.
 *
 * Archive-then-scrub runs in one transaction: a failed archive must not be
 * allowed to scrub. Re-running on an already-deleted account is a no-op, so a
 * repeated DELETE can't overwrite the archive with the placeholder values it
 * wrote the first time.
 */
export const softDeleteAccount = async (id: string) => {
  return prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { id },
      include: { lawyerProfile: true, firmProfile: true },
    });
    if (!account) return { account: null, expiredRequests: [] };
    // Already deleted — must not re-archive over good evidence with the
    // placeholder values the first pass wrote.
    if (account.status === "deleted") return { account, expiredRequests: [] };

    const deletedAt = new Date();

    await tx.accountDeletionRecord.create({
      data: {
        accountId: account.id,
        authUserId: account.authUserId,
        role: account.role,
        membershipTier: account.membershipTier,
        email: account.email,
        phone: account.phone,
        fullName: account.fullName,
        firstName: account.firstName,
        lastName: account.lastName,
        scn: account.lawyerProfile?.scn ?? null,
        rcNumber: account.firmProfile?.rcNumber ?? null,
        deletedAt,
        purgeAfter: purgeAfterFor(deletedAt),
      },
    });

    // Stop the counterparty messaging someone who can no longer read it.
    // Archived, not closed — closing prompts both sides for a review, which is
    // the wrong thing to ask about an account that has just walked away.
    await tx.conversation.updateMany({
      where: {
        status: "active",
        OR: [{ userAccountId: id }, { lawyerAccountId: id }],
      },
      data: { status: "archived", archivedAt: deletedAt },
    });

    // Kill pending requests in both directions. A lead left pending is a lead a
    // lawyer can still accept, which would open a conversation with an account
    // that can never read it; and a request pending against a lawyer who has
    // left will never be answered. `expired` is the existing terminal state for
    // "this can no longer proceed", and the allowance query already excludes it,
    // so a client is not charged a slot for the other party walking away.
    const expiredRequests = await tx.request.findMany({
      where: {
        status: "pending",
        OR: [{ userAccountId: id }, { lawyerAccountId: id }],
      },
      select: {
        id: true,
        userAccountId: true,
        lawyerAccountId: true,
        intakePayload: true,
      },
    });
    if (expiredRequests.length > 0) {
      await tx.request.updateMany({
        where: { id: { in: expiredRequests.map((r) => r.id) } },
        // Status only — `respondedAt` means the lawyer answered, and nobody did.
        // Matches how the stale-request cron expires them.
        data: { status: "expired" },
      });
    }

    const updated = await tx.account.update({
      where: { id },
      data: {
        status: "deleted",
        deletedAt,
        phone: null,
        avatarUrl: null,
        coverUrl: null,
        bio: null,
        firstName: null,
        lastName: null,
        fullName: DELETED_ACCOUNT_NAME,
        email: `deleted-${id}@deleted.local`,
      },
    });

    // Offer release and counterparty notifications are the caller's job — they
    // touch Redis and sockets and must not run inside the transaction.
    return { account: updated, expiredRequests };
  });
};

export const incrementAccountCounter = (
  id: string,
  field: "connectionCount" | "followerCount" | "followingCount" | "reviewCount",
  delta: number
) => {
  return prisma.account.update({
    where: { id },
    data: { [field]: { increment: delta } },
  });
};
