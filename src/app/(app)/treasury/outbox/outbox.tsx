"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { outboxStatusValues } from "@/api/schema.gen";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { columnsFor, DataTable } from "@/components/data-table";
import { FilterBar, FilterSelect } from "@/components/filters";
import { CopyValue, DateTime, StatusBadge } from "@/components/format";
import { BackLink, HistoryLink } from "@/components/history-link";
import { JsonView } from "@/components/json-view";
import { GatedButton, RequireOp } from "@/components/permission";
import { ErrorState, Field, Fields, LoadingBlock, PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCursorList } from "@/hooks/use-cursor-list";
import { compact, useUrlFilters } from "@/hooks/use-url-filters";

type Msg = components["schemas"]["OutboxMessage"];
type OutboxStatus = components["schemas"]["OutboxStatus"];
const STATUSES = outboxStatusValues;
const KEYS = ["status"] as const;

const MESSAGE_EFFECT: Record<string, string> = {
  "monime.commission_transfer": "moves the platform commission at Monime (real money)",
  "sms.receipt": "sends the payer's receipt SMS again",
  "portal.application_paid": "tells the admissions portal the application fee is paid",
};

export function RetryOutbox({ m: msg, size = "sm" }: { m: Msg; size?: "sm" | "xs" }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: () => call(api.POST("/v1/admin/outbox/{id}/retry", { params: { path: { id: msg.id } } })),
    meta: { inlineError: true },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: qk.outboxRoot });
      void qc.invalidateQueries({ queryKey: qk.reconciliation });
      toast.success(`Message retried: now ${r.status}`);
    },
  });
  return (
    <>
      <GatedButton
        op="adminRetryOutbox"
        size={size}
        variant="outline"
        onClick={() => setOpen(true)}
        disabledReason={msg.status !== "DEAD" ? `Only DEAD messages can be retried (this one is ${msg.status})` : null}
      >
        <RotateCw aria-hidden /> Retry
      </GatedButton>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Retry this outbox message now?" confirmLabel="Retry now" onConfirm={() => m.mutateAsync()}>
        <p>
          Dispatches <span className="font-mono">{msg.type}</span> again after {msg.attempts} failed attempts. It{" "}
          {MESSAGE_EFFECT[msg.type] ?? "runs the message's side effect again"}. The dedupe key{" "}
          <span className="break-all font-mono">{msg.dedupeKey}</span> keeps it from happening twice.
        </p>
        {msg.lastError && <p>Last error: {msg.lastError}</p>}
      </ConfirmDialog>
    </>
  );
}

const col = columnsFor<Msg>();
const columns = [
  col.accessor("createdAt", { header: "Created", cell: (c) => <DateTime iso={c.getValue()} /> }),
  col.accessor("type", { header: "Type", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor("status", { header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor("attempts", { header: "Attempts", meta: { align: "right" } }),
  col.accessor((m) => m.lastError ?? "", {
    id: "error",
    header: "Last error",
    cell: (c) => <span className="block max-w-72 truncate text-xs text-destructive" title={c.getValue()}>{c.getValue() || ""}</span>,
  }),
  col.accessor("sentAt", { header: "Sent", cell: (c) => <DateTime iso={c.getValue()} /> }),
  col.display({ id: "retry", header: "", cell: (c) => (c.row.original.status === "DEAD" ? <RetryOutbox m={c.row.original} size="xs" /> : null) }),
];

function List() {
  const { values, set, reset, active } = useUrlFilters(KEYS);
  const status = (STATUSES as readonly string[]).includes(values.status) ? (values.status as OutboxStatus) : undefined;
  const list = useCursorList(qk.outbox(compact({ status })), (cursor) => call(api.GET("/v1/admin/outbox", { params: { query: { status, cursor, limit: 50 } } })));
  return (
    <>
      <PageHeader title="Outbox" description="Side effects sent after a payment: receipt SMS, portal notifications, commission transfers. DEAD ones gave up retrying." />
      <FilterBar onReset={reset} active={active}>
        <FilterSelect label="Status" value={values.status} onChange={(v) => set({ status: v })} options={STATUSES} />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.rows}
        getRowId={(m) => m.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        hasMore={list.hasMore}
        loadingMore={list.loadingMore}
        onLoadMore={list.loadMore}
        rowHref={(m) => `/treasury/outbox/${m.id}`}
        emptyTitle={active ? "No messages match" : "Outbox is empty"}
      />
    </>
  );
}

export function OutboxList() {
  return (
    <RequireOp op="adminOutbox">
      <List />
    </RequireOp>
  );
}

function Detail({ id }: { id: string }) {
  const q = useQuery({ queryKey: qk.outboxMessage(id), queryFn: () => call(api.GET("/v1/admin/outbox/{id}", { params: { path: { id } } })) });
  if (q.isPending) return <LoadingBlock rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const m = q.data;
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <BackLink href="/treasury/outbox">Outbox</BackLink>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{m.type}</span> <StatusBadge status={m.status} />
            </span>
          }
          actions={
            <>
              <HistoryLink entity="OutboxMessage" entityId={m.id} />
              {m.status === "DEAD" && <RetryOutbox m={m} />}
            </>
          }
        />
      </div>
      {m.lastError && (
        <Alert variant="destructive">
          <AlertTitle>Last error</AlertTitle>
          <AlertDescription>{m.lastError}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="pt-4">
          <Fields>
            <Field label="Dedupe key">
              <CopyValue value={m.dedupeKey} className="break-all" />
            </Field>
            <Field label="Attempts">{m.attempts}</Field>
            <Field label="Next attempt">
              <DateTime iso={m.nextAttemptAt} />
            </Field>
            <Field label="Created">
              <DateTime iso={m.createdAt} />
            </Field>
            <Field label="Sent">
              <DateTime iso={m.sentAt} />
            </Field>
            <Field label="Locked until">
              <DateTime iso={m.lockedUntil} />
            </Field>
          </Fields>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Payload</CardTitle>
        </CardHeader>
        <CardContent>
          <JsonView value={m.payload} />
        </CardContent>
      </Card>
    </div>
  );
}

export function OutboxDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireOp op="adminGetOutbox">
      <Detail id={id} />
    </RequireOp>
  );
}
