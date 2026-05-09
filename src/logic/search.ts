import { prisma } from "../config/database";
import { response } from "../helpers/utility";
import { Response } from "../interface";
import { paginate, buildPagination } from "../helpers/pagination";
import { maskAccount } from "../services/anonymity";

const escapeLike = (q: string) => q.replace(/%/g, "\\%").replace(/_/g, "\\_");

export const _search = async (
  q: string,
  type: "lawyer" | "firm" | "article" | "all",
  viewerId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const term = `%${escapeLike(q)}%`;

  const types = type === "all" ? ["lawyer", "firm", "article"] : [type];

  const result: any = {};
  let total = 0;

  if (types.includes("lawyer")) {
    const where = {
      role: "LAWYER",
      status: "active",
      OR: [
        { fullName: { contains: q, mode: "insensitive" as const } },
        { bio: { contains: q, mode: "insensitive" as const } },
      ],
    };
    const [items, count] = await Promise.all([
      prisma.account.findMany({
        where,
        include: { lawyerProfile: true },
        orderBy: [{ avgRating: "desc" }, { reviewCount: "desc" }],
        skip,
        take,
      }),
      prisma.account.count({ where }),
    ]);
    result.lawyers = items.map((a) => maskAccount(a as any, viewerId));
    total += count;
  }

  if (types.includes("firm")) {
    const where = {
      role: "FIRM",
      status: "active",
      OR: [
        { fullName: { contains: q, mode: "insensitive" as const } },
        { bio: { contains: q, mode: "insensitive" as const } },
      ],
    };
    const [items, count] = await Promise.all([
      prisma.account.findMany({
        where,
        include: { firmProfile: true },
        orderBy: [{ avgRating: "desc" }, { reviewCount: "desc" }],
        skip,
        take,
      }),
      prisma.account.count({ where }),
    ]);
    result.firms = items.map((a) => maskAccount(a as any, viewerId));
    total += count;
  }

  if (types.includes("article")) {
    const where = {
      status: "published",
      deletedAt: null,
      OR: [
        { title: { contains: q, mode: "insensitive" as const } },
        { body: { contains: q, mode: "insensitive" as const } },
      ],
    };
    const [items, count] = await Promise.all([
      prisma.article.findMany({
        where,
        include: { author: true },
        orderBy: { publishedAt: "desc" },
        skip,
        take,
      }),
      prisma.article.count({ where }),
    ]);
    result.articles = items.map((a) => ({
      ...a,
      author: maskAccount(a.author as any, viewerId),
    }));
    total += count;
  }

  return response({
    error: false,
    message: "Search results",
    data: { ...result, pagination: buildPagination(total, p, l) },
  });
};
