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
      : { status: "published", startAt: { gte: now } };
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

export const createEvent = async (data: any) => prisma.event.create({ data });
export const updateEvent = async (id: string, data: any) =>
  prisma.event.update({ where: { id }, data });
export const deleteEvent = async (id: string) => prisma.event.delete({ where: { id } });
