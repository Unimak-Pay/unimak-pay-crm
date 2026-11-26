"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { reconciliationItemStatusValues, reconciliationRunStatusValues, webhookEventStatusValues } from "@/api/schema.gen";
import { columnsFor, DataTable } from "@/components/data-table";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/filters";
import { DateTime, Money, PaymentStatusBadge, StatusBadge } from "@/components/format";
import { RequireOp } from "@/components/permission";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCursorList } from "@/hooks/use-cursor-list";
import { compact, useUrlFilters } from "@/hooks/use-url-filters";
import { formatRelative } from "@/lib/time";
import { RetryOutbox } from "../treasury/outbox/outbox";
import { RetryTransfer } from "../treasury/transfers/transfers";
import { eventColumns, ITEM_KINDS, itemColumns, runColumns, StartRun } from "./shared";

type S = components["schemas"];
type Summary = S["ReconciliationSummary"];
const KEYS = ["tab", "status", "kind", "runStatus", "evStatus", "type", "unresolved"] as const;
const TABS = ["attention", "items", "runs", "events"] as const;

function Section({ id, title, count, limit, children }: { id: string; title: string; count: number; limit: number; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-16">
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium">
          {title} <span className="tabular-nums text-muted-foreground">({count})</span>
        </CardTitle>
        {count > limit && <span className="text-xs text-muted-foreground">showing the latest {limit}</span>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const trCol = columnsFor<S["Transfer"]>();
const transferColumns = [
  trCol.accessor("createdAt", { header: "Created", cell: (c) => <DateTime iso={c.getValue()} /> }),
  trCol.accessor("sourceAccount", { header: "From", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  trCol.accessor("status", { header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  trCol.accessor((t) => t.failureMessage ?? "", { id: "why", header: "Failure", cell: (c) => <span className="block max-w-64 truncate text-xs text-destructive">{c.getValue()}</span> }),
  trCol.accessor("amount", { header: "Amount", meta: { align: "right" }, cell: (c) => <Money minor={c.getValue()} /> }),
  trCol.display({ id: "retry", header: "", cell: (c) => (c.row.original.status === "FAILED" ? <RetryTransfer t={c.row.original} size="xs" /> : null) }),
];
const poCol = columnsFor<S["Payout"]>();
const payoutColumns = [
  poCol.accessor("createdAt", { header: "Created", cell: (c) => <DateTime iso={c.getValue()} /> }),
  poCol.accessor("accountNumber", { header: "To account", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  poCol.accessor("status", { header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  poCol.accessor((p) => p.failureMessage ?? "", { id: "why", header: "Failure", cell: (c) => <span className="block max-w-64 truncate text-xs text-destructive">{c.getValue()}</span> }),
  poCol.accessor("amount", { header: "Amount", meta: { align: "right" }, cell: (c) => <Money minor={c.getValue()} /> }),
];
const obCol = columnsFor<S["OutboxMessage"]>();
const outboxColumns = [
  obCol.accessor("createdAt", { header: "Created", cell: (c) => <DateTime iso={c.getValue()} /> }),
  obCol.accessor("type", { header: "Type", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  obCol.accessor("attempts", { header: "Attempts", meta: { align: "right" } }),
  obCol.accessor((m) => m.lastError ?? "", { id: "err", header: "Last error", cell: (c) => <span className="block max-w-72 truncate text-xs text-destructive">{c.getValue()}</span> }),
  obCol.display({ id: "retry", header: "", cell: (c) => <RetryOutbox m={c.row.original} size="xs" /> }),
];
const pmCol = columnsFor<S["Payment"]>();
const paymentColumns = [
  pmCol.accessor("createdAt", { header: "Created", cell: (c) => <DateTime iso={c.getValue()} /> }),
  pmCol.accessor("paymentRef", { header: "Ref", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  pmCol.accessor("status", { header: "Status", cell: (c) => <PaymentStatusBadge status={c.getValue()} /> }),
  pmCol.accessor("processingAt", { header: "Processing since", cell: (c) => <DateTime iso={c.getValue()} /> }),
  pmCol.accessor("amount", { header: "Amount", meta: { align: "right" }, cell: (c) => <Money minor={c.getValue()} /> }),
];

/** Oldest processing first (the server already sorts; this keeps it so whatever arrives). */
const byProcessingAt = (rows: S["Payment"][]) => [...rows].sort((a, b) => (a.processingAt ?? "").localeCompare(b.processingAt ?? ""));

function Attention({ s }: { s: Summary }) {
  const L = s.listLimit;
  const small = { isLoading: false, error: null } as const;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Last run:{" "}
        {s.lastRun ? (
          <Link className="underline-offset-2 hover:underline" href={`/reconciliation/runs/${s.lastRun.id}`}>
            <StatusBadge status={s.lastRun.status} /> {formatRelative(s.lastRun.startedAt)}
          </Link>
        ) : (
          "never"
        )}
      </p>
      <Section id="openItems" title="Open reconciliation items" count={s.counts.openItems} limit={L}>
        <DataTable {...small} columns={itemColumns} rows={s.openItems} getRowId={(i) => i.id} emptyTitle="No open items" />
      </Section>
      <Section id="webhookEvents" title="Unmatched or failed webhook events" count={s.counts.webhookEvents} limit={L}>
        <DataTable {...small} columns={eventColumns} rows={s.webhookEvents} getRowId={(e) => e.id} rowHref={(e) => `/reconciliation/events/${encodeURIComponent(e.id)}`} emptyTitle="None" />
      </Section>
      {/* null without transfers.read (commission transfers are super-admin only): hide the sections */}
      {s.failedTransfers !== null && s.counts.failedTransfers !== null && (
        <Section id="failedTransfers" title="Failed commission transfers" count={s.counts.failedTransfers} limit={L}>
          <DataTable {...small} columns={transferColumns} rows={s.failedTransfers} getRowId={(t) => t.id} rowHref={(t) => `/treasury/transfers/${t.id}`} emptyTitle="None" />
        </Section>
      )}
      {s.stuckTransfers !== null && s.counts.stuckTransfers !== null && (
        <Section id="stuckTransfers" title="Stuck transfers (pending over an hour)" count={s.counts.stuckTransfers} limit={L}>
          <DataTable {...small} columns={transferColumns} rows={s.stuckTransfers} getRowId={(t) => t.id} rowHref={(t) => `/treasury/transfers/${t.id}`} emptyTitle="None" />
        </Section>
      )}
      <Section id="stuckPayouts" title="Stuck payouts (in flight over an hour)" count={s.counts.stuckPayouts} limit={L}>
        <DataTable {...small} columns={payoutColumns} rows={s.stuckPayouts} getRowId={(p) => p.id} rowHref={(p) => `/treasury/payouts/${p.id}`} emptyTitle="None" />
      </Section>
      <Section id="failedPayouts" title="Failed payouts (last 7 days)" count={s.counts.failedPayouts} limit={L}>
        <DataTable {...small} columns={payoutColumns} rows={s.failedPayouts} getRowId={(p) => p.id} rowHref={(p) => `/treasury/payouts/${p.id}`} emptyTitle="None" />
      </Section>
      <Section id="deadOutbox" title="Dead outbox messages" count={s.counts.deadOutbox} limit={L}>
        <DataTable {...small} columns={outboxColumns} rows={s.deadOutbox} getRowId={(m) => m.id} rowHref={(m) => `/treasury/outbox/${m.id}`} emptyTitle="None" />
      </Section>
      <Section id="staleOpenPayments" title="Processing for over an hour" count={s.counts.staleOpenPayments} limit={L}>
        <p className="mb-2 text-xs text-muted-foreground">
          Monime started collecting but hasn&apos;t confirmed. With no completion in 24 hours they go back to awaiting payment; if Monime did collect, the
          nightly reconciliation completes them. Oldest first.
        </p>
        <DataTable {...small} columns={paymentColumns} rows={byProcessingAt(s.staleOpenPayments)} getRowId={(p) => p.id} rowHref={(p) => `/payments/${p.id}`} emptyTitle="None" />
      </Section>
    </div>
  );
}

const ITEM_STATUSES = reconciliationItemStatusValues;
const RUN_STATUSES = reconciliationRunStatusValues;
const EVENT_STATUSES = webhookEventStatusValues;

function ItemsTab({ values, set }: { values: Record<(typeof KEYS)[number], string>; set(p: Partial<Record<(typeof KEYS)[number], string>>): void }) {
  const status = (ITEM_STATUSES as readonly string[]).includes(values.status) ? (values.status as S["ReconciliationItemStatus"]) : undefined;
  const kind = values.kind || undefined;
  const list = useCursorList(qk.items(compact({ status, kind })), (cursor) =>
    call(api.GET("/v1/admin/reconciliation/items", { params: { query: { status, kind, cursor, limit: 50 } } })),
  );
  return (
    <>
      <FilterBar>
        <FilterSelect label="Status" value={values.status} onChange={(v) => set({ status: v })} options={ITEM_STATUSES} />
        <FilterSelect label="Kind" value={values.kind} onChange={(v) => set({ kind: v })} options={Object.entries(ITEM_KINDS).map(([value, label]) => ({ value, label }))} />
      </FilterBar>
      <DataTable
        columns={itemColumns}
        rows={list.rows}
        getRowId={(i) => i.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        hasMore={list.hasMore}
        loadingMore={list.loadingMore}
        onLoadMore={list.loadMore}
        rowHref={(i) => `/reconciliation/runs/${i.runId}`}
        emptyTitle="No items"
      />
    </>
  );
}

function RunsTab({ values, set }: { values: Record<(typeof KEYS)[number], string>; set(p: Partial<Record<(typeof KEYS)[number], string>>): void }) {
  const status = (RUN_STATUSES as readonly string[]).includes(values.runStatus) ? (values.runStatus as S["ReconciliationRunStatus"]) : undefined;
  const list = useCursorList(qk.runs(compact({ status })), (cursor) => call(api.GET("/v1/admin/reconciliation/runs", { params: { query: { status, cursor, limit: 50 } } })));
  return (
    <>
      <FilterBar>
        <FilterSelect label="Status" value={values.runStatus} onChange={(v) => set({ runStatus: v })} options={RUN_STATUSES} />
      </FilterBar>
      <DataTable
        columns={runColumns}
        rows={list.rows}
        getRowId={(r) => r.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        hasMore={list.hasMore}
        loadingMore={list.loadingMore}
        onLoadMore={list.loadMore}
        rowHref={(r) => `/reconciliation/runs/${r.id}`}
        emptyTitle="No runs yet"
      />
    </>
  );
}

function EventsTab({ values, set }: { values: Record<(typeof KEYS)[number], string>; set(p: Partial<Record<(typeof KEYS)[number], string>>): void }) {
  const status = (EVENT_STATUSES as readonly string[]).includes(values.evStatus) ? (values.evStatus as S["WebhookEventStatus"]) : undefined;
  const type = values.type || undefined;
  const unresolved = values.unresolved === "true" ? true : undefined;
  const list = useCursorList(qk.webhookEvents(compact({ status, type, unresolved })), (cursor) =>
    call(api.GET("/v1/admin/reconciliation/webhook-events", { params: { query: { status, type, unresolved, cursor, limit: 50 } } })),
  );
  return (
    <>
      <FilterBar>
        <FilterSelect label="Status" value={values.evStatus} onChange={(v) => set({ evStatus: v })} options={EVENT_STATUSES} />
        <FilterSearch label="Event type" placeholder="payment.processing_completed" value={values.type} onChange={(v) => set({ type: v })} />
        <FilterSelect
          label="Resolution"
          value={values.unresolved}
          onChange={(v) => set({ unresolved: v })}
          options={[{ value: "true", label: "Unresolved only" }]}
          allLabel="All events"
        />
      </FilterBar>
      <DataTable
        columns={eventColumns}
        rows={list.rows}
        getRowId={(e) => e.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        hasMore={list.hasMore}
        loadingMore={list.loadingMore}
        onLoadMore={list.loadMore}
        rowHref={(e) => `/reconciliation/events/${encodeURIComponent(e.id)}`}
        emptyTitle="No events"
      />
    </>
  );
}

function Page() {
  const { values, set } = useUrlFilters(KEYS);
  const tab = (TABS as readonly string[]).includes(values.tab) ? values.tab : "attention";
  const q = useQuery({ queryKey: qk.reconciliation, queryFn: () => call(api.GET("/v1/admin/reconciliation")), refetchInterval: 60_000 });
  const c = q.data?.counts;
  const attention = c ? Object.values(c).reduce<number>((a, b) => a + (b ?? 0), 0) : 0;
  return (
    <>
      <PageHeader title="Reconciliation" description="Nightly comparison with Monime, and everything that needs a person." actions={<StartRun />} />
      <Tabs
        value={tab}
        onValueChange={(v) =>
          // switching tabs drops the other tabs' filters
          set({ tab: v === "attention" ? "" : v, status: "", kind: "", runStatus: "", evStatus: "", type: "", unresolved: "" })
        }
      >
        <TabsList>
          <TabsTrigger value="attention">Needs attention{c ? ` (${attention})` : ""}</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="events">Webhook events</TabsTrigger>
        </TabsList>
        <TabsContent value="attention" className="pt-2">
          {q.isPending ? <LoadingBlock /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <Attention s={q.data} />}
        </TabsContent>
        <TabsContent value="items" className="pt-2">
          <ItemsTab values={values} set={set} />
        </TabsContent>
        <TabsContent value="runs" className="pt-2">
          <RunsTab values={values} set={set} />
        </TabsContent>
        <TabsContent value="events" className="pt-2">
          <EventsTab values={values} set={set} />
        </TabsContent>
      </Tabs>
    </>
  );
}

export function Reconciliation() {
  return (
    <RequireOp op="adminReconciliation">
      <Page />
    </RequireOp>
  );
}
