"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { DataTable } from "@/components/data-table";
import { CopyValue, DateTime, StatusBadge } from "@/components/format";
import { BackLink, HistoryLink } from "@/components/history-link";
import { JsonView } from "@/components/json-view";
import { RequireOp } from "@/components/permission";
import { ErrorState, Field, Fields, LoadingBlock, PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDay } from "@/lib/time";
import { itemColumns, ReplayEvent, ResolveEvent } from "./shared";

function RunDetailInner({ id }: { id: string }) {
  const q = useQuery({ queryKey: qk.run(id), queryFn: () => call(api.GET("/v1/admin/reconciliation/runs/{id}", { params: { path: { id } } })) });
  if (q.isPending) return <LoadingBlock rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const r = q.data;
  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <BackLink href="/reconciliation?tab=runs">Reconciliation runs</BackLink>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              Run for {formatDay(r.windowStart)} <StatusBadge status={r.status} />
            </span>
          }
          description={`${r.items.length} item(s) · triggered by ${r.triggeredBy === "cron" ? "the nightly job" : "an admin"}`}
          actions={<HistoryLink entity="ReconciliationRun" entityId={r.id} />}
        />
      </div>
      {r.error && (
        <Alert variant="destructive">
          <AlertTitle>The run failed</AlertTitle>
          <AlertDescription>{r.error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="pt-4">
          <Fields>
            <Field label="Window start">
              <DateTime iso={r.windowStart} />
            </Field>
            <Field label="Window end">
              <DateTime iso={r.windowEnd} />
            </Field>
            <Field label="Triggered by">{r.triggeredBy === "cron" ? "Nightly job" : <CopyValue value={r.triggeredBy} truncate />}</Field>
            <Field label="Started">
              <DateTime iso={r.startedAt} />
            </Field>
            <Field label="Finished">
              <DateTime iso={r.finishedAt} />
            </Field>
          </Fields>
          <div className="mt-4">
            <div className="mb-1 text-xs text-muted-foreground">Stats</div>
            <JsonView value={r.stats} maxHeight="12rem" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Items</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={itemColumns} rows={r.items} getRowId={(i) => i.id} isLoading={false} error={null} emptyTitle="Nothing flagged: everything matched" />
        </CardContent>
      </Card>
    </div>
  );
}

export function RunDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireOp op="adminRun">
      <RunDetailInner id={id} />
    </RequireOp>
  );
}

function EventDetailInner({ id }: { id: string }) {
  const q = useQuery({
    queryKey: qk.webhookEvent(id),
    queryFn: () => call(api.GET("/v1/admin/reconciliation/webhook-events/{id}", { params: { path: { id } } })),
  });
  const [ack, setAck] = useState<components["schemas"]["WebhookAck"] | null>(null);
  if (q.isPending) return <LoadingBlock rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const e = q.data;
  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <BackLink href="/reconciliation?tab=events">Webhook events</BackLink>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{e.type}</span> <StatusBadge status={e.status} />
            </span>
          }
          description={<CopyValue value={e.id} />}
          actions={
            <>
              <HistoryLink entity="WebhookEvent" entityId={e.id} />
              <ResolveEvent e={e} />
              <ReplayEvent
                e={e}
                onResult={(r) => {
                  setAck(r);
                  void q.refetch();
                }}
              />
            </>
          }
        />
      </div>
      {ack && (
        <Alert variant={ack.result === "UNMATCHED" ? "destructive" : "default"}>
          <AlertTitle>Replay result: {ack.result}</AlertTitle>
          {ack.note && <AlertDescription>{ack.note}</AlertDescription>}
        </Alert>
      )}
      {e.error && (
        <Alert>
          <AlertTitle>Outcome</AlertTitle>
          <AlertDescription>{e.error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="pt-4">
          <Fields>
            <Field label="Received">
              <DateTime iso={e.receivedAt} />
            </Field>
            <Field label="Processed">
              <DateTime iso={e.processedAt} />
            </Field>
            <Field label="Attempts">{e.attempts}</Field>
            <Field label="Resolved">
              <DateTime iso={e.resolvedAt} />
            </Field>
            <Field label="Resolved by">
              <CopyValue value={e.resolvedBy} truncate />
            </Field>
            <Field label="Resolution">{e.resolution ?? "—"}</Field>
          </Fields>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Raw payload (as Monime sent it)</CardTitle>
        </CardHeader>
        <CardContent>
          <JsonView value={e.payload} />
        </CardContent>
      </Card>
    </div>
  );
}

export function EventDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireOp op="adminWebhookEvent">
      <EventDetailInner id={decodeURIComponent(id)} />
    </RequireOp>
  );
}
