import { prisma } from "../config/database";

export const createServiceRequest = async (data: any) =>
  prisma.serviceRequest.create({ data });

export const findServiceRequestById = async (id: string) =>
  prisma.serviceRequest.findUnique({ where: { id }, include: { event: true } });

export const listServiceRequestsByAccount = async (
  accountId: string,
  skip: number,
  take: number
) => {
  const where = { accountId };
  const [items, total] = await Promise.all([
    prisma.serviceRequest.findMany({
      where,
      include: { event: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.serviceRequest.count({ where }),
  ]);
  return { items, total };
};

export const listServiceRequests = async (
  filters: { type?: string; status?: string },
  skip: number,
  take: number
) => {
  const where: any = {};
  if (filters.type) where.type = filters.type;
  if (filters.status) where.status = filters.status;
  const [items, total] = await Promise.all([
    prisma.serviceRequest.findMany({
      where,
      include: { event: true, account: { select: { id: true, fullName: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.serviceRequest.count({ where }),
  ]);
  return { items, total };
};

export const updateServiceRequestStatus = async (id: string, status: string) =>
  prisma.serviceRequest.update({ where: { id }, data: { status } });
