import { Pagination } from "../interface";

export const buildPagination = (total: number, page: number, limit: number): Pagination => ({
  total,
  page,
  limit,
  totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
});

export const paginate = (
  page: number = 1,
  limit: number = 20
): { skip: number; take: number; page: number; limit: number } => {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  return { skip: (safePage - 1) * safeLimit, take: safeLimit, page: safePage, limit: safeLimit };
};
