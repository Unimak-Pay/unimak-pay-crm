"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Plus, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { componentsParametersSortValues, payoutStatusValues } from "@/api/schema.gen";
import { columnsFor, DataTable, minorSortValue } from "@/components/data-table";
import { FilterBar, FilterSelect } from "@/components/filters";
import { CopyValue, DateTime, Money, StatusBadge } from "@/components/format";
import { BackLink, HistoryLink } from "@/components/history-link";
import { RequireOp, useCanOp } from "@/components/permission";
import { ErrorState, Field, Fields, LoadingBlock, PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCursorList } from "@/hooks/use-cursor-list";
import { compact, useUrlFilters } from "@/hooks/use-url-filters";
import { formatSle, sleInWords } from "@/lib/money";

type Payout = components["schemas"]["PayoutListItem"];
type PayoutStatus = components["schemas"]["PayoutStatus"];
type Sort = NonNullable<components["parameters"]["Sort"]>;
const STATUSES = payoutStatusValues;
const SORTS = componentsParametersSortValues;
const KEYS = ["status", "sort"] as const;
const FINAL = new Set<PayoutStatus>(["COMPLETED", "FAILED"]);

const col = columnsFor<Payout>();
const columns = [
  col.accessor("createdAt", { id: "createdAt", header: "Created", cell: (c) => <DateTime iso={c.getValue()} /> }),
  col.accessor((p) => p.financialAccount.reference, { id: "from", header: "From", enableSorting: false, cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor("providerId", { header: "Bank", enableSorting: false, cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor("accountNumber", {
    header: "To account",
    enableSorting: false,
    cell: (c) => (
      <div>
        <span className="font-mono text-xs">{c.getValue()}</span>
        {c.row.original.accountName && <div className="max-w-44 truncate text-[11px] text-muted-foreground">{c.row.original.accountName}</div>}
      </div>
    ),
  }),
  col.accessor("narration", { header: "Narration", enableSorting: false, cell: (c) => <span className="block max-w-48 truncate">{c.getValue() ?? "—"}</span> }),
  col.accessor("status", { header: "Status", enableSorting: false, cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor((p) => minorSortValue(p.amount), { id: "amount", header: "Amount", meta: { align: "right" }, cell: (c) => <Money minor={c.row.original.amount} /> }),
];

function List() {
  const canOp = useCanOp();
  const { values, set, reset, active } = useUrlFilters(KEYS);
  const sort: Sort = (SORTS as readonly string[]).includes(values.sort) ? (values.sort as Sort) : "-createdAt";
  const status = (STATUSES as readonly string[]).includes(values.status) ? (values.status as PayoutStatus) : undefined;
  const list = useCursorList(qk.payouts(compact({ status, sort })), (cursor) =>
    call(api.GET("/v1/admin/payouts", { params: { query: { status, sort, cursor, limit: 50 } } })),
  );
  return (
    <>
      <PageHeader
        title="Payouts"
        description="Withdrawals from fee accounts to bank accounts. The result arrives later from Monime."
        actions={
          canOp("adminCreatePayout") && (
            <Button asChild size="sm">
              <Link href="/treasury/payouts/new">
                <Plus aria-hidden /> New payout
              </Link>
            </Button>
          )
        }
      />
      <FilterBar onReset={reset} active={active}>
        <FilterSelect label="Status" value={values.status} onChange={(v) => set({ status: v })} options={STATUSES} />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.rows}
        getRowId={(p) => p.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        hasMore={list.hasMore}
        loadingMore={list.loadingMore}
        onLoadMore={list.loadMore}
        rowHref={(p) => `/treasury/payouts/${p.id}`}
        emptyTitle={active ? "No payouts match" : "No payouts yet"}
        serverSort={{ value: sort, onChange: (v) => set({ sort: v === "-createdAt" ? "" : v }), columns: { createdAt: "createdAt", amount: "amount" } }}
      />
    </>
  );
}

export function PayoutsList() {
  return (
    <RequireOp op="adminListPayouts">
      <List />
    </RequireOp>
  );
}

function Detail({ id }: { id: string }) {
  const justSubmitted = useSearchParams().get("submitted") === "1";
  const banks = useQuery({ queryKey: qk.banks, queryFn: () => call(api.GET("/v1/admin/banks")), staleTime: 5 * 60_000 });
  const q = useQuery({
    queryKey: qk.payout(id),
    queryFn: () => call(api.GET("/v1/admin/payouts/{id}", { params: { path: { id } } })),
    // The outcome arrives by Monime webhook: poll until it is final.
    refetchInterval: (query) => (query.state.data && FINAL.has(query.state.data.status) ? false : 3000),
  });
  if (q.isPending) return <LoadingBlock rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const p = q.data;
  const bank = banks.data?.find((b) => b.providerId === p.providerId);
  const final = FINAL.has(p.status);

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <BackLink href="/treasury/payouts">Payouts</BackLink>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              Payout {formatSle(p.amount)} <StatusBadge status={p.status} />
            </span>
          }
          description={`${p.financialAccount.reference} → ${bank?.name ?? p.providerId} ${p.accountNumber}`}
          actions={<HistoryLink entity="Payout" entityId={p.id} />}
        />
      </div>
      {!final && (
        <Alert>
          <Loader2 className="animate-spin" aria-hidden />
          <AlertTitle>{justSubmitted ? "Submitted to Monime" : "In progress"}</AlertTitle>
          <AlertDescription>Waiting for Monime to report the result. This page updates by itself.</AlertDescription>
        </Alert>
      )}
      {p.status === "COMPLETED" && (
        <Alert>
          <CheckCircle2 className="text-emerald-600" aria-hidden />
          <AlertTitle>Paid out</AlertTitle>
          <AlertDescription>
            Monime completed the payout <DateTime iso={p.completedAt} />.
          </AlertDescription>
        </Alert>
      )}
      {p.status === "FAILED" && (
        <Alert variant="destructive">
          <XCircle aria-hidden />
          <AlertTitle>The payout failed</AlertTitle>
          <AlertDescription>
            {p.failureMessage ?? "No reason given"}
            {p.failureCode && <span className="font-mono"> ({p.failureCode})</span>}
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="pt-4">
          <Fields>
            <Field label="Amount">
              <Money minor={p.amount} className="font-semibold" />
              <div className="text-xs text-muted-foreground">{sleInWords(p.amount)}</div>
            </Field>
            <Field label="Monime fees">
              <Money minor={p.fees} />
            </Field>
            <Field label="Status">
              <StatusBadge status={p.status} />
            </Field>
            <Field label="From account">
              <CopyValue value={p.financialAccount.reference} />
              <div className="text-xs text-muted-foreground">{p.financialAccount.name}</div>
            </Field>
            <Field label="Bank">{bank?.name ?? p.providerId}</Field>
            <Field label="Account number">
              <CopyValue value={p.accountNumber} />
            </Field>
            <Field label="Account name">{p.accountName ?? "—"}</Field>
            <Field label="Narration">{p.narration ?? "—"}</Field>
            <Field label="Destination type">{p.destinationType}</Field>
            <Field label="Created">
              <DateTime iso={p.createdAt} />
            </Field>
            <Field label="Updated">
              <DateTime iso={p.updatedAt} />
            </Field>
            <Field label="Completed">
              <DateTime iso={p.completedAt} />
            </Field>
            <Field label="Monime payout id">
              <CopyValue value={p.monimePayoutId} />
            </Field>
            <Field label="Idempotency key">
              <CopyValue value={p.idempotencyKey} truncate />
            </Field>
            <Field label="Requested by">
              <CopyValue value={p.requestedBy} truncate />
            </Field>
          </Fields>
        </CardContent>
      </Card>
    </div>
  );
}

export function PayoutDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireOp op="adminGetPayout">
      <Detail id={id} />
    </RequireOp>
  );
}
