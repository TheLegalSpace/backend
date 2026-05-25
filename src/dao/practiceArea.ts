import { prisma } from "../config/database";

export const findActivePracticeAreas = async () => {
  return prisma.practiceArea.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
};

export const findAllPracticeAreas = async () => {
  return prisma.practiceArea.findMany({ orderBy: { name: "asc" } });
};

export const findPracticeAreasByIds = async (ids: string[]) => {
  if (ids.length === 0) return [];
  return prisma.practiceArea.findMany({ where: { id: { in: ids } } });
};

export const createPracticeArea = async (name: string, slug: string) => {
  return prisma.practiceArea.create({ data: { name, slug } });
};

export const updatePracticeArea = async (
  id: string,
  data: { name?: string; isActive?: boolean }
) => {
  return prisma.practiceArea.update({ where: { id }, data });
};
