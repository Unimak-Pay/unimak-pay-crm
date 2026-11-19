"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { componentsParametersSortValues, transferStatusValues } from "@/api/schema.gen";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { columnsFor, DataTable, minorSortValue } from "@/components/data-table";
import { FilterBar, FilterSelect } from "@/components/filters";
import { CopyValue, DateTime, Money, StatusBadge } from "@/components/format";
import { BackLink, HistoryLink } from "@/components/history-link";
import { GatedButton, RequireOp, useCanOp } from "@/components/permission";
import { ErrorState, Field, Fields, LoadingBlock, PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { useCursorList } from "@/hooks/use-cursor-list";
import { compact, useUrlFilters } from "@/hooks/use-url-filters";
import { formatSle } from "@/lib/money";

type Transfer = components["schemas"]["Transfer"];
type TransferStatus = components["schemas"]["TransferStatus"];
type Sort = NonNullable<components["parameters"]["Sort"]>;
const STATUSES = transferStatusValues;
const SORTS = componentsParametersSortValues;
const KEYS = ["status", "sort"] as const;

/** Retry a FAILED transfer, behind a confirm that names the money movement. */
export function RetryTransfer({ t, size = "sm" }: { t: Transfer; size?: "sm" | "xs" }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: () => call(api.POST("/v1/admin/transfers/{id}/retry", { params: { path: { id: t.id } } })),
    meta: { inlineError: true },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: qk.transfersRoot });
      void qc.invalidateQueries({ queryKey: qk.reconciliation });
      void qc.invalidateQueries({ queryKey: qk.paymentsRoot });
      toast.success(`Transfer retried (attempt ${r.attempt}): now ${r.status}`);
    },
  });
  return (
    <>
      <GatedButton
        op="adminRetryTransfer"
        size={size}
        variant="outline"
        onClick={() => setOpen(true)}
        disabledReason={t.status !== "FAILED" ? `Only FAILED transfers can be retried (this one is ${t.status})` : null}
      >
        <RotateCw aria-hidden /> Retry
      </GatedButton>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Retry this commission transfer?" confirmLabel={`Transfer ${formatSle(t.amount)}`} onConfirm={() => m.mutateAsync()}>
        <p>
          Moves <strong>{formatSle(t.amount)}</strong> at Monime from <span className="font-mono">{t.sourceAccount}</span> to{" "}
          <span className="font-mono">{t.destinationAccount}</span>, as attempt {t.attempt + 1} with a new idempotency key.
        </p>
        {t.failureMessage && <p>Last failure: {t.failureMessage}</p>}
      </ConfirmDialog>
    </>
  );
}

const col = columnsFor<Transfer>();
const columns = [
  col.accessor("createdAt", { id: "createdAt", header: "Created", cell: (c) => <DateTime iso={c.getValue()} /> }),
  col.accessor("kind", { header: "Kind", enableSorting: false }),
  col.accessor("sourceAccount", { header: "From", enableSorting: false, cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor("destinationAccount", { header: "To", enableSorting: false, cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor("attempt", { header: "Attempt", enableSorting: false, meta: { align: "right" } }),
  col.accessor("status", {
    header: "Status",
    enableSorting: false,
    cell: (c) => (
      <div>
        <StatusBadge status={c.getValue()} />
        {c.row.original.failureMessage && <div className="mt-0.5 max-w-56 truncate text-[11px] text-destructive" title={c.row.original.failureMessage}>{c.row.original.failureMessage}</div>}
      </div>
    ),
  }),
  col.accessor((t) => minorSortValue(t.amount), { id: "amount", header: "Amount", meta: { align: "right" }, cell: (c) => <Money minor={c.row.original.amount} /> }),
  col.display({ id: "retry", header: "", cell: (c) => (c.row.original.status === "FAILED" ? <RetryTransfer t={c.row.original} size="xs" /> : null) }),
];

function List() {
  const { values, set, reset, active } = useUrlFilters(KEYS);
  const sort: Sort = (SORTS as readonly string[]).includes(values.sort) ? (values.sort as Sort) : "-createdAt";
  const status = (STATUSES as readonly string[]).includes(values.status) ? (values.status as TransferStatus) : undefined;
  const list = useCursorList(qk.transfers(compact({ status, sort })), (cursor) =>
    call(api.GET("/v1/admin/transfers", { params: { query: { status, sort, cursor, limit: 50 } } })),
  );
  return (
    <>
      <PageHeader title="Commission transfers" description="After a payment completes, the platform fee moves from the fee account to the platform account." />
      <FilterBar onReset={reset} active={active}>
        <FilterSelect label="Status" value={values.status} onChange={(v) => set({ status: v })} options={STATUSES} />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.rows}
        getRowId={(t) => t.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        hasMore={list.hasMore}
        loadingMore={list.loadingMore}
        onLoadMore={list.loadMore}
        rowHref={(t) => `/treasury/transfers/${t.id}`}
        emptyTitle={active ? "No transfers match" : "No transfers yet"}
        serverSort={{ value: sort, onChange: (v) => set({ sort: v === "-createdAt" ? "" : v }), columns: { createdAt: "createdAt", amount: "amount" } }}
      />
    </>
  );
}

export function TransfersList() {
  return (
    <RequireOp op="adminListTransfers">
      <List />
    </RequireOp>
  );
}

function Detail({ id }: { id: string }) {
  const canOp = useCanOp();
  const q = useQuery({ queryKey: qk.transfer(id), queryFn: () => call(api.GET("/v1/admin/transfers/{id}", { params: { path: { id } } })) });
  if (q.isPending) return <LoadingBlock rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const t = q.data;
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <BackLink href="/treasury/transfers">Commission transfers</BackLink>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              Transfer {formatSle(t.amount)} <StatusBadge status={t.status} />
            </span>
          }
          description={`${t.sourceAccount} → ${t.destinationAccount}`}
          actions={
            <>
              <HistoryLink entity="Transfer" entityId={t.id} />
              {t.status === "FAILED" && <RetryTransfer t={t} />}
            </>
          }
        />
      </div>
      {t.status === "FAILED" && (
        <Alert variant="destructive">
          <AlertTitle>Failed{t.failureCode && <span className="font-mono"> · {t.failureCode}</span>}</AlertTitle>
          <AlertDescription>{t.failureMessage ?? "No reason given"}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="pt-4">
          <Fields>
            <Field label="Amount">
              <Money minor={t.amount} className="font-semibold" />
            </Field>
            <Field label="Kind">{t.kind}</Field>
            <Field label="Attempt">{t.attempt}</Field>
            <Field label="From">
              <CopyValue value={t.sourceAccount} />
            </Field>
            <Field label="To">
              <CopyValue value={t.destinationAccount} />
            </Field>
            <Field label="Monime transfer id">
              <CopyValue value={t.monimeTransferId} />
            </Field>
            <Field label="Created">
              <DateTime iso={t.createdAt} />
            </Field>
            <Field label="Updated">
              <DateTime iso={t.updatedAt} />
            </Field>
            <Field label="Completed">
              <DateTime iso={t.completedAt} />
            </Field>
            <Field label="Payment">
              {t.paymentId ? (
                canOp("adminGetPayment") ? (
                  <Link className="underline-offset-2 hover:underline" href={`/payments/${t.paymentId}`}>
                    Open payment →
                  </Link>
                ) : (
                  <CopyValue value={t.paymentId} truncate />
                )
              ) : (
                "—"
              )}
            </Field>
          </Fields>
        </CardContent>
      </Card>
    </div>
  );
}

export function TransferDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireOp op="adminGetTransfer">
      <Detail id={id} />
    </RequireOp>
  );
}
