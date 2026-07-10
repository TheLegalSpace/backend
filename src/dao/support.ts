import { prisma } from "../config/database";

export const createTicket = async (data: {
  accountId: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  body: string;
}) => prisma.supportTicket.create({ data });

export const findTicketById = async (id: string) =>
  prisma.supportTicket.findUnique({
    where: { id },
    include: { account: { select: { id: true, fullName: true, email: true, role: true } } },
  });

export const listTickets = async (
  filters: { status?: string; category?: string; q?: string },
  skip: number,
  take: number
) => {
  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.category) where.category = filters.category;
  if (filters.q) {
    where.OR = [
      { subject: { contains: filters.q, mode: "insensitive" } },
      { name: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: { account: { select: { id: true, fullName: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { items, total };
};

export const listTicketsByAccount = async (accountId: string, skip: number, take: number) => {
  const where = { accountId };
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.supportTicket.count({ where }),
  ]);
  return { items, total };
};

export const updateTicketStatus = async (id: string, status: string) =>
  prisma.supportTicket.update({ where: { id }, data: { status } });

export const ticketCountsByStatus = async (): Promise<Record<string, number>> => {
  const rows = await prisma.supportTicket.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r._count._all;
  return out;
};
