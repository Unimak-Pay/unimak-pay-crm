"use client";

import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  tableFeatures,
  useTable,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, LoadingBlock } from "./states";

export const tableFeaturesDef = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime },
});
type F = typeof tableFeaturesDef;

/** Column helper bound to the app's table features. */
export function columnsFor<T extends RowData>() {
  return createColumnHelper<F, T>();
}

export type ColumnMeta = { align?: "right"; className?: string };

/** Accessor for a minor-unit string column that sorts numerically (BigInt, never float). */
export function minorSortValue(v: string | null | undefined): bigint {
  return v === null || v === undefined || v === "" ? -1n : BigInt(v);
}

type ServerSort = {
  /** Current API sort value, e.g. "-createdAt" or "amount". */
  value: string;
  onChange(value: string): void;
  /** Column ids the API can sort by, mapped to the API field. */
  columns: Record<string, string>;
};

export type DataTableProps<T extends RowData> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: any[];
  rows: T[] | undefined;
  getRowId(row: T): string;
  isLoading: boolean;
  error: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyHint?: React.ReactNode;
  /** Row link (whole row clickable). */
  rowHref?: (row: T) => string | undefined;
  /** Cursor pagination. */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /**
   * With serverSort, sortable columns ask the API to sort (paging stays correct).
   * Without it, header clicks sort the rows already loaded.
   */
  serverSort?: ServerSort;
  className?: string;
};

const EMPTY: never[] = [];

export function DataTable<T extends RowData>({
  columns,
  rows,
  getRowId,
  isLoading,
  error,
  onRetry,
  emptyTitle = "Nothing here yet",
  emptyHint,
  rowHref,
  hasMore,
  loadingMore,
  onLoadMore,
  serverSort,
  className,
}: DataTableProps<T>) {
  const router = useRouter();
  const [clientSorting, setClientSorting] = useState<SortingState>([]);

  const serverSorting = useMemo<SortingState>(() => {
    if (!serverSort) return [];
    const desc = serverSort.value.startsWith("-");
    const field = serverSort.value.replace(/^-/, "");
    const id = Object.entries(serverSort.columns).find(([, f]) => f === field)?.[0];
    return id ? [{ id, desc }] : [];
  }, [serverSort]);

  const table = useTable({
    features: tableFeaturesDef,
    columns,
    data: rows ?? (EMPTY as T[]),
    getRowId: (r) => getRowId(r as T),
    manualSorting: !!serverSort,
    enableSortingRemoval: !serverSort,
    state: { sorting: serverSort ? serverSorting : clientSorting },
    onSortingChange: (updater) => {
      if (!serverSort) {
        setClientSorting(updater);
        return;
      }
      const next = typeof updater === "function" ? updater(serverSorting) : updater;
      const first = next[0];
      if (!first) {
        serverSort.onChange("-createdAt");
        return;
      }
      const field = serverSort.columns[first.id];
      if (field) serverSort.onChange(`${first.desc ? "-" : ""}${field}`);
    },
  });

  if (isLoading) return <LoadingBlock className={className} />;
  if (error && !rows?.length) return <ErrorState error={error} onRetry={onRetry} className={className} />;

  const tableRows = table.getRowModel().rows;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="overflow-x-auto rounded-md border">
        <Table className="text-[13px]">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const meta = (header.column.columnDef.meta ?? {}) as ColumnMeta;
                  const sortable = serverSort ? header.column.id in serverSort.columns : header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={cn("h-9 whitespace-nowrap", meta.align === "right" && "text-right", meta.className)}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 hover:text-foreground",
                            meta.align === "right" && "flex-row-reverse",
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3" aria-hidden />
                          ) : (
                            <ArrowUpDown className="size-3 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {tableRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  <EmptyState title={emptyTitle}>{emptyHint}</EmptyState>
                </TableCell>
              </TableRow>
            ) : (
              tableRows.map((row) => {
                const href = rowHref?.(row.original as T);
                return (
                  <TableRow
                    key={row.id}
                    className={cn(href && "cursor-pointer")}
                    onClick={
                      href
                        ? (e) => {
                            // let buttons, links and text selection behave normally
                            if ((e.target as HTMLElement).closest("a,button,input,select,textarea,[role=button]")) return;
                            if (window.getSelection()?.toString()) return;
                            if (e.metaKey || e.ctrlKey) window.open(href, "_blank", "noopener");
                            else router.push(href);
                          }
                        : undefined
                    }
                  >
                    {row.getAllCells().map((cell, i) => {
                      const meta = (cell.column.columnDef.meta ?? {}) as ColumnMeta;
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn("py-1.5", meta.align === "right" && "text-right tabular-nums", meta.className)}
                        >
                          {href && i === 0 && (
                            <Link href={href} className="sr-only focus:not-sr-only focus:mr-2 focus:underline">
                              Open
                            </Link>
                          )}
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {error && rows?.length ? <ErrorState error={error} onRetry={onRetry} className="mt-2 py-3" /> : null}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {rows?.length ?? 0} {rows?.length === 1 ? "row" : "rows"}
          {hasMore ? " loaded" : ""}
          {!serverSort && clientSorting.length > 0 && hasMore ? " · sorting the loaded rows only" : ""}
        </span>
        {hasMore && onLoadMore && (
          <Button size="sm" variant="outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="animate-spin" aria-hidden />}
            Load more
          </Button>
        )}
      </div>
    </div>
  );
}
