import { prisma } from "../config/database";

const audienceWhere = (audience: string) => {
  const base: any = { status: "active" };
  switch (audience) {
    case "lawyers":
      return { ...base, role: "LAWYER" };
    case "firms":
      return { ...base, role: "FIRM" };
    case "clients":
      return { ...base, role: "USER" };
    default:
      return base; // "all"
  }
};

export const createAnnouncement = async (data: {
  title: string;
  body: string;
  audience: string;
  status: string;
  scheduledAt?: Date | null;
  createdByAdminId: string;
}) => prisma.announcement.create({ data });

export const getAnnouncementById = async (id: string) =>
  prisma.announcement.findUnique({ where: { id } });

export const listAnnouncements = async (skip: number, take: number) => {
  const [items, total] = await Promise.all([
    prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, skip, take }),
    prisma.announcement.count(),
  ]);
  return { items, total };
};

export const updateAnnouncement = async (id: string, data: Record<string, any>) =>
  prisma.announcement.update({ where: { id }, data });

// Audience account IDs for the fan-out.
export const audienceAccountIds = async (audience: string): Promise<string[]> => {
  const rows = await prisma.account.findMany({
    where: audienceWhere(audience),
    select: { id: true },
  });
  return rows.map((r) => r.id);
};

// Bulk-insert one system notification per recipient. Efficient for large
// fan-outs (thousands) — clients pick these up via REST; the 2-min unread-count
// cache TTL self-heals the bell badge without per-account invalidation.
export const bulkCreateAnnouncementNotifications = async (
  recipientIds: string[],
  payload: object
): Promise<number> => {
  if (recipientIds.length === 0) return 0;
  const result = await prisma.notification.createMany({
    data: recipientIds.map((recipientAccountId) => ({
      recipientAccountId,
      type: "system",
      payload,
    })),
  });
  return result.count;
};
