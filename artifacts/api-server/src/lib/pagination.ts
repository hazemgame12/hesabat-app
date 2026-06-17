/**
 * Pagination helpers for list endpoints.
 *
 * Usage on a route handler:
 *   const pg = parsePagination(req.query);   // null = no ?page param → return full array
 *   if (pg) {
 *     const [{ total }] = await db.select({ total: count() }).from(table).where(cond);
 *     const rows = await db.select().from(table).where(cond).limit(pg.limit).offset(pg.offset);
 *     res.json(paginatedResponse(rows, Number(total), pg.page, pg.limit));
 *   } else {
 *     const rows = await db.select().from(table).where(cond);
 *     res.json(rows);
 *   }
 */

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Parse `page` and `limit` from Express req.query.
 * Returns null if `page` is not present → caller should return the full array
 * for backward compatibility (e.g. dropdown selectors still get all records).
 */
export function parsePagination(
  query: Record<string, unknown>,
  defaultLimit = DEFAULT_PAGE_LIMIT,
): PaginationParams | null {
  if (query["page"] === undefined) return null;
  const page = Math.max(1, parseInt(String(query["page"]), 10) || 1);
  const limit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, parseInt(String(query["limit"] ?? defaultLimit), 10) || defaultLimit),
  );
  return { page, limit, offset: (page - 1) * limit };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
