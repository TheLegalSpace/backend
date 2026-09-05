import { DELETED_ACCOUNT_NAME } from "../config/accountDeletion";

type AccountLike = {
  id: string;
  role: string;
  fullName: string;
  email: string;
  isAnonymous: boolean;
  status?: string;
  avatarUrl?: string | null;
  [key: string]: any;
};

const maskEmail = (email: string): string => {
  if (!email) return email;
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${"*".repeat(local.length)}@${domain}`;
  return `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
};

export const maskAccount = <T extends AccountLike>(
  account: T,
  viewerAccountId?: string | null
): T => {
  if (!account) return account;

  // Deleted first, and for every role — a lawyer who deletes their account is
  // exactly the case this is for, and the anonymity rules below are USER-only.
  // The row is already scrubbed at rest; this catches a stale copy and strips
  // the account id out of the `deleted-{id}@deleted.local` placeholder.
  if (account.status === "deleted") {
    return {
      ...account,
      fullName: DELETED_ACCOUNT_NAME,
      firstName: null,
      lastName: null,
      email: "deleted@deleted.local",
      phone: null,
      avatarUrl: null,
      coverUrl: null,
      bio: null,
    };
  }

  if (account.role !== "USER") return account;
  if (account.id === viewerAccountId) return account;
  if (!account.isAnonymous) return account;

  return {
    ...account,
    fullName: "Anonymous User",
    email: maskEmail(account.email),
  };
};

export const maskAccountSummary = <T extends AccountLike>(
  account: T,
  viewerAccountId?: string | null
) => maskAccount(account, viewerAccountId);
