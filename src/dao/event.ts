import { prisma } from "../config/database";

export const listEvents = async (
  status: "upcoming" | "past",
  skip: number,
  take: number
) => {
  const now = new Date();
  const where =
    status === "past"
      ? { OR: [{ status: "past" }, { endAt: { lt: now } }] }
      : {
          status: "published",
          OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }],
        };
  const [items, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { startAt: status === "upcoming" ? "asc" : "desc" },
      skip,
      take,
    }),
    prisma.event.count({ where }),
  ]);
  return { items, total };
};

export const findEventById = async (id: string) => {
  return prisma.event.findUnique({ where: { id } });
};

// Admin: list ALL events across every status (draft, pending_payment,
// pending_review, published, rejected, past). Includes the linked promotion
// service request (organizer + payment) when the event came through the
// promotion flow; null for editorial events created via POST /events.
export const listEventsAdmin = async (
  filters: { status?: string; q?: string },
  skip: number,
  take: number
) => {
  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.q) where.title = { contains: filters.q, mode: "insensitive" };
  const [items, total] = await Promise.all([
    prisma.event.findMany({
      where,
      include: {
        serviceRequest: {
          include: { account: { select: { id: true, fullName: true, email: true, role: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.event.count({ where }),
  ]);
  return { items, total };
};

export const incrementEventClick = async (id: string) =>
  prisma.event.update({ where: { id }, data: { clickCount: { increment: 1 } } });

export const createEvent = async (data: any) => prisma.event.create({ data });
export const updateEvent = async (id: string, data: any) =>
  prisma.event.update({ where: { id }, data });
export const deleteEvent = async (id: string) => prisma.event.delete({ where: { id } });
