import { useQuery } from "@tanstack/react-query";

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function usePaginatedQuery<T>(
  path: string,
  page: number,
  limit = 50,
  params?: Record<string, string | number | boolean | undefined | null>,
  options?: { enabled?: boolean },
) {
  return useQuery<PaginatedResult<T>>({
    queryKey: [path, { page, limit, ...params }],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const search = new URLSearchParams();
      search.set("page", String(page));
      search.set("limit", String(limit));
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== null && v !== "") {
            search.set(k, String(v));
          }
        }
      }
      const res = await fetch(`${path}?${search.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<PaginatedResult<T>>;
    },
    retry: false,
    placeholderData: (prev) => prev,
  });
}
