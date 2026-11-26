"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Play, RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { columnsFor } from "@/components/data-table";
import { CopyValue, DateTime, StatusBadge } from "@/components/format";
import { GatedButton } from "@/components/permission";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDay, yesterdayUtc } from "@/lib/time";

export type Item = components["schemas"]["ReconciliationItem"];
export type Run = components["schemas"]["ReconciliationRun"];
export type EventSummary = components["schemas"]["WebhookEventSummary"];

/** Human labels for item kinds (from the spec's ReconciliationItem.kind description). */
export const ITEM_KINDS: Record<string, string> = {
  MISSED_WEBHOOK_SETTLED: "Missed webhook, settled",
  UNMATCHED_MONIME_PAYMENT: "Monime payment with no match",
  MISSING_AT_MONIME: "Missing at Monime",
  AMOUNT_MISMATCH: "Amount mismatch",
  MONIME_FEE_MISMATCH: "Monime fee mismatch",
  COMMISSION_MISSING: "Commission missing",
  COMMISSION_NOT_COMPLETED: "Commission not completed",
  COMMISSION_AMOUNT_MISMATCH: "Commission amount mismatch",
  SCAN_TRUNCATED: "Scan truncated",
};

export function invalidateRecon(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: qk.reconciliation });
}

export function ResolveItem({ item, size = "xs" }: { item: Item; size?: "xs" | "sm" }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: (resolution: string) => call(api.POST("/v1/admin/reconciliation/items/{id}/resolve", { params: { path: { id: item.id } }, body: { resolution } })),
    meta: { inlineError: true },
    onSuccess: () => {
      invalidateRecon(qc);
      void qc.invalidateQueries({ queryKey: qk.auditRoot });
      toast.success("Item resolved");
    },
  });
  return (
    <>
      <GatedButton op="adminResolveItem" size={size} variant="outline" onClick={() => setOpen(true)} disabledReason={item.status !== "OPEN" ? `This item is ${item.status}` : null}>
        <CheckCheck aria-hidden /> Resolve
      </GatedButton>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Resolve this reconciliation item?"
        confirmLabel="Mark resolved"
        note={{ label: "What was done", placeholder: "e.g. Confirmed with Monime support: test payment, no action needed" }}
        onConfirm={(note) => m.mutateAsync(note)}
      >
        <p>
          <strong>{ITEM_KINDS[item.kind] ?? item.kind}</strong>: {item.note}
        </p>
        <p>Marks it RESOLVED with your note. Nothing is changed at Monime or in the ledger.</p>
      </ConfirmDialog>
    </>
  );
}

export function ResolveEvent({ e, size = "sm" }: { e: EventSummary; size?: "xs" | "sm" }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: (resolution: string) => call(api.POST("/v1/admin/reconciliation/webhook-events/{id}/resolve", { params: { path: { id: e.id } }, body: { resolution } })),
    meta: { inlineError: true },
    onSuccess: () => {
      invalidateRecon(qc);
      toast.success("Event resolved");
    },
  });
  const resolvable = (e.status === "UNMATCHED" || e.status === "FAILED") && !e.resolvedAt;
  return (
    <>
      <GatedButton
        op="adminResolveEvent"
        size={size}
        variant="outline"
        onClick={() => setOpen(true)}
        disabledReason={!resolvable ? (e.resolvedAt ? "Already resolved" : `Only UNMATCHED or FAILED events can be resolved (this one is ${e.status})`) : null}
      >
        <CheckCheck aria-hidden /> Resolve
      </GatedButton>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Resolve this webhook event?"
        confirmLabel="Mark resolved"
        note={{ label: "Why it needs no further action", placeholder: "e.g. Duplicate of evt-…, already processed" }}
        onConfirm={(note) => m.mutateAsync(note)}
      >
        <p>
          <span className="font-mono">{e.type}</span> ({e.status}) received <DateTime iso={e.receivedAt} />.
        </p>
        <p>Marks it resolved with your note, without processing it again.</p>
      </ConfirmDialog>
    </>
  );
}

export function ReplayEvent({ e, onResult }: { e: EventSummary; onResult?(r: components["schemas"]["WebhookAck"]): void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: () => call(api.POST("/v1/admin/reconciliation/webhook-events/{id}/replay", { params: { path: { id: e.id } } })),
    meta: { inlineError: true },
    onSuccess: (r) => {
      invalidateRecon(qc);
      void qc.invalidateQueries({ queryKey: qk.paymentsRoot });
      void qc.invalidateQueries({ queryKey: qk.payoutsRoot });
      onResult?.(r);
      toast.success(`Replayed: ${r.result}`);
    },
  });
  return (
    <>
      <GatedButton op="adminReplayEvent" size="sm" onClick={() => setOpen(true)}>
        <RotateCw aria-hidden /> Replay
      </GatedButton>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Process this event again?" confirmLabel="Replay event" onConfirm={() => m.mutateAsync()}>
        <p>
          Runs the stored <span className="font-mono">{e.type}</span> event through the webhook handler again, as if Monime had just sent
          it. If it now matches a payment or payout, that record is updated (for a completed payment: ledger entry, receipt and
          commission transfer). Duplicates are detected.
        </p>
      </ConfirmDialog>
    </>
  );
}

export function StartRun() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(yesterdayUtc());
  const m = useMutation({
    mutationFn: () => call(api.POST("/v1/admin/reconciliation/runs", { body: { date } })),
    meta: { inlineError: true },
    onSuccess: (run) => {
      invalidateRecon(qc);
      void qc.invalidateQueries({ queryKey: qk.paymentsRoot });
      toast.success(`Reconciled ${formatDay(date)}: ${run.status}, ${run.items.length} item(s)`, {
        action: { label: "Open", onClick: () => router.push(`/reconciliation/runs/${run.id}`) },
      });
    },
  });
  return (
    <>
      <GatedButton op="adminStartRun" size="sm" onClick={() => (setDate(yesterdayUtc()), setOpen(true))}>
        <Play aria-hidden /> Reconcile a day
      </GatedButton>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Reconcile a day against Monime" confirmLabel={`Reconcile ${formatDay(date)}`} onConfirm={() => m.mutateAsync()}>
        <div className="space-y-1.5">
          <Label htmlFor="run-date">Day (UTC)</Label>
          <Input id="run-date" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(ev) => setDate(ev.target.value)} />
        </div>
        <p>
          Compares that day&apos;s payments with Monime. Payments whose webhook never arrived are settled automatically (ledger, receipt,
          commission); everything else is flagged as an item for a person.
        </p>
      </ConfirmDialog>
    </>
  );
}

// ── columns ──

const itemCol = columnsFor<Item>();
export const itemColumns = [
  itemCol.accessor("createdAt", { header: "Flagged", cell: (c) => <DateTime iso={c.getValue()} /> }),
  itemCol.accessor("kind", { header: "Kind", cell: (c) => <span title={c.getValue()}>{ITEM_KINDS[c.getValue()] ?? c.getValue()}</span> }),
  itemCol.accessor("status", { header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  itemCol.accessor("note", { header: "Note", cell: (c) => <span className="block max-w-80 truncate" title={c.getValue()}>{c.getValue()}</span> }),
  itemCol.accessor((i) => i.paymentId ?? i.monimePaymentId ?? "", {
    id: "ref",
    header: "Payment",
    cell: (c) =>
      c.row.original.paymentId ? (
        <Link href={`/payments/${c.row.original.paymentId}`} className="text-xs underline-offset-2 hover:underline">
          Open payment
        </Link>
      ) : (
        <CopyValue value={c.row.original.monimePaymentId} />
      ),
  }),
  itemCol.accessor((i) => i.resolution ?? "", {
    id: "resolution",
    header: "Resolution",
    cell: (c) => <span className="block max-w-56 truncate text-xs text-muted-foreground" title={c.getValue()}>{c.getValue() || "—"}</span>,
  }),
  itemCol.display({ id: "resolve", header: "", cell: (c) => (c.row.original.status === "OPEN" ? <ResolveItem item={c.row.original} /> : null) }),
];

const runCol = columnsFor<Run>();
export const runColumns = [
  runCol.accessor("windowStart", { header: "Day", cell: (c) => <span className="tabular-nums">{formatDay(c.getValue())}</span> }),
  runCol.accessor("status", { header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  runCol.accessor("triggeredBy", { header: "Triggered by", cell: (c) => (c.getValue() === "cron" ? "Nightly job" : <CopyValue value={c.getValue()} truncate />) }),
  runCol.accessor("startedAt", { header: "Started", cell: (c) => <DateTime iso={c.getValue()} /> }),
  runCol.accessor("finishedAt", { header: "Finished", cell: (c) => <DateTime iso={c.getValue()} /> }),
  runCol.accessor((r) => r.error ?? "", { id: "error", header: "Error", cell: (c) => <span className="block max-w-64 truncate text-xs text-destructive">{c.getValue()}</span> }),
];

const evCol = columnsFor<EventSummary>();
export const eventColumns = [
  evCol.accessor("receivedAt", { header: "Received", cell: (c) => <DateTime iso={c.getValue()} /> }),
  evCol.accessor("type", { header: "Type", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  evCol.accessor("status", { header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  evCol.accessor("attempts", { header: "Attempts", meta: { align: "right" } }),
  // in full: an UNMATCHED note names the deleted payment and obligation someone has to apply or refund
  evCol.accessor((e) => e.error ?? "", { id: "error", header: "Outcome", cell: (c) => <span className="block min-w-64 max-w-md text-xs break-words whitespace-normal">{c.getValue() || "—"}</span> }),
  evCol.accessor((e) => (e.resolvedAt ? "resolved" : ""), {
    id: "resolved",
    header: "Resolved",
    cell: (c) => (c.row.original.resolvedAt ? <DateTime iso={c.row.original.resolvedAt} /> : <span className="text-muted-foreground">—</span>),
  }),
  evCol.accessor("id", { header: "Event id", cell: (c) => <CopyValue value={c.getValue()} /> }),
];
