"use client";

import { AlertTriangle, CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { portalEventResultValues } from "@/api/schema.gen";
import { columnsFor, DataTable } from "@/components/data-table";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/filters";
import { DateTime, StatusBadge } from "@/components/format";
import { RequireOp } from "@/components/permission";
import { PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { useCursorList } from "@/hooks/use-cursor-list";
import { compact, useUrlFilters } from "@/hooks/use-url-filters";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { lastUpdateLabel, syncHealth } from "../sync-health";

type Event = components["schemas"]["PortalEvent"];
type Result = components["schemas"]["PortalEventResult"];
type EventType = "applicant.upserted" | "student.upserted";

const TYPES: readonly EventType[] = ["applicant.upserted", "student.upserted"];
const RESULTS = portalEventResultValues;
const KEYS = ["type", "result", "ref"] as const;

const col = columnsFor<Event>();
const columns = [
  col.accessor("receivedAt", { header: "Received", cell: (c) => <DateTime iso={c.getValue()} /> }),
  col.accessor("type", { header: "Type", enableSorting: false, cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor("ref", { header: "Ref", enableSorting: false, cell: (c) => <span className="font-mono text-xs">{c.getValue() ?? "—"}</span> }),
  col.accessor("result", { header: "Result", enableSorting: false, cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor((e) => (e.result === "REJECTED" ? (e.error ?? "") : ""), {
    id: "error",
    header: "Error",
    enableSorting: false,
    cell: (c) => <span className="block max-w-96 text-xs text-destructive">{c.getValue()}</span>,
  }),
];

/** Re-renders every minute so "5 min ago" stays true. */
export function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/** "Last update from the portal: 5 min ago", amber after 24 hours without an applied event. */
export function SyncBadge({ lastAppliedAt, now }: { lastAppliedAt: string | null; now: Date }) {
  const health = syncHealth(lastAppliedAt, now);
  const ok = health === "fresh";
  return (
    <Badge
      variant="outline"
      data-testid="portal-sync"
      data-health={health}
      title={lastAppliedAt ? formatDateTime(lastAppliedAt) : undefined}
      className={cn(
        "h-7 gap-1.5 px-2.5 text-xs font-normal",
        ok
          ? "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
      )}
    >
      {ok ? <CircleCheck aria-hidden /> : <AlertTriangle aria-hidden />}
      {lastUpdateLabel(lastAppliedAt, now)}
    </Badge>
  );
}

function List() {
  const now = useNow();
  const { values, set, reset, active } = useUrlFilters(KEYS);
  const type = (TYPES as readonly string[]).includes(values.type) ? (values.type as EventType) : undefined;
  const result = (RESULTS as readonly string[]).includes(values.result) ? (values.result as Result) : undefined;
  const query = compact({ type, result, ref: values.ref.trim() });
  const list = useCursorList(qk.portalEvents(query), (cursor) => call(api.GET("/v1/admin/portal-events", { params: { query: { ...query, cursor, limit: 50 } } })));
  const first = list.firstPage;

  return (
    <>
      <PageHeader
        title="Portal events"
        description="Student and applicant changes the university portal sent, newest first. Kept 90 days. A REJECTED event needs fixing in the portal and sending again with a new id."
        actions={first ? <SyncBadge lastAppliedAt={first.lastAppliedAt} now={now} /> : null}
      />
      <FilterBar onReset={reset} active={active}>
        <FilterSelect label="Type" value={values.type} onChange={(v) => set({ type: v })} options={TYPES} />
        <FilterSelect label="Result" value={values.result} onChange={(v) => set({ result: v })} options={RESULTS} />
        <FilterSearch label="Ref (student id or application ref)" placeholder="UNI-2025-0101 · APP-2026-2002" value={values.ref} onChange={(v) => set({ ref: v })} />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.rows}
        getRowId={(e) => e.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        hasMore={list.hasMore}
        loadingMore={list.loadingMore}
        onLoadMore={list.loadMore}
        emptyTitle={active ? "No events match these filters" : "The portal hasn't sent anything yet"}
      />
    </>
  );
}

export function PortalEventsList() {
  return (
    <RequireOp op="adminPortalEvents">
      <List />
    </RequireOp>
  );
}
