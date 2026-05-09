type AccountLike = {
  id: string;
  role: string;
  fullName: string;
  email: string;
  isAnonymous: boolean;
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
