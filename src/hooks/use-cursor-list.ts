"use client";

import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import { useMemo } from "react";

export type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Cursor pagination (`?limit=&cursor=`, newest first) as one flat row list plus
 * "load more". The query key must include every filter. `firstPage` keeps any extra
 * fields the endpoint returns beside `items` (e.g. `lastAppliedAt`).
 */
export function useCursorList<P extends Page<unknown>>(
  queryKey: QueryKey,
  fetchPage: (cursor: string | undefined) => Promise<P>,
  opts: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: opts.enabled ?? true,
    refetchInterval: opts.refetchInterval,
  });
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items as P["items"][number][]), [q.data]);
  return {
    rows,
    isLoading: q.isPending && q.fetchStatus !== "idle",
    error: q.error,
    refetch: () => void q.refetch(),
    hasMore: q.hasNextPage,
    loadingMore: q.isFetchingNextPage,
    loadMore: () => void q.fetchNextPage(),
    isFetching: q.isFetching,
    firstPage: q.data?.pages[0],
  };
}
