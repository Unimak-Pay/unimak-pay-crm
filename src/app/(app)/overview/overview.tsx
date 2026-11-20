"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { useMe } from "@/auth/auth-provider";
import { useScopeNames } from "@/components/academics";
import { CopyValue, DateTime, Money, StatusBadge } from "@/components/format";
import { Can, useCanOp } from "@/components/permission";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelative } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Collections } from "./collections";

type Counts = components["schemas"]["ReconciliationSummary"]["counts"];

/** Where each attention count leads. */
const ATTENTION: { key: keyof Counts; label: string; href: string }[] = [
  { key: "openItems", label: "Open reconciliation items", href: "/reconciliation?tab=items" },
  { key: "webhookEvents", label: "Unmatched webhook events", href: "/reconciliation?tab=events" },
  { key: "failedTransfers", label: "Failed commission transfers", href: "/treasury/transfers?status=FAILED" },
  { key: "stuckTransfers", label: "Stuck transfers (> 1 h)", href: "/reconciliation?tab=attention#stuckTransfers" },
  { key: "stuckPayouts", label: "Stuck payouts (> 1 h)", href: "/reconciliation?tab=attention#stuckPayouts" },
  { key: "failedPayouts", label: "Failed payouts (7 days)", href: "/treasury/payouts?status=FAILED" },
  { key: "deadOutbox", label: "Dead outbox messages", href: "/treasury/outbox?status=DEAD" },
  { key: "staleOpenPayments", label: "Stale open payments", href: "/reconciliation?tab=attention#staleOpenPayments" },
];

function Attention() {
  const q = useQuery({ queryKey: qk.reconciliation, queryFn: () => call(api.GET("/v1/admin/reconciliation")), refetchInterval: 60_000 });
  if (q.isPending) return <LoadingBlock rows={2} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { counts, lastRun } = q.data;
  // transfer counts are null without transfers.read (super admins only): those tiles are hidden
  const tiles = ATTENTION.flatMap((a) => {
    const n = counts[a.key];
    return n === null ? [] : [{ ...a, n }];
  });
  const total = tiles.reduce((s, a) => s + a.n, 0);
  return (
    <section aria-labelledby="attention-h" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="attention-h" className="flex items-center gap-1.5 text-base font-semibold">
          {total ? <AlertTriangle className="size-4 text-amber-600" aria-hidden /> : <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />}
          {total ? "Needs attention" : "Nothing needs attention"}
        </h2>
        <span className="text-xs text-muted-foreground">
          Last reconciliation:{" "}
          {lastRun ? (
            <Link href={`/reconciliation/runs/${lastRun.id}`} className="underline-offset-2 hover:underline">
              <StatusBadge status={lastRun.status} /> {formatRelative(lastRun.startedAt)}
            </Link>
          ) : (
            "never"
          )}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(({ n, ...a }) => {
          return (
            <Link
              key={a.key}
              href={a.href}
              className={cn(
                "group rounded-md border p-3 transition-colors hover:bg-accent",
                n > 0 && "border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/20",
              )}
            >
              <div className={cn("text-2xl font-semibold tabular-nums", n === 0 && "text-muted-foreground")}>{n}</div>
              <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
                {a.label}
                <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Balances() {
  const q = useQuery({ queryKey: qk.accounts, queryFn: () => call(api.GET("/v1/admin/financial-accounts")) });
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium">Account balances</CardTitle>
        <Link href="/treasury/accounts" className="text-xs text-muted-foreground hover:text-foreground">
          All accounts →
        </Link>
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <LoadingBlock rows={4} />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data.length ? (
          <EmptyState title="No accounts yet" />
        ) : (
          <ul className="divide-y text-sm">
            {q.data.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <div className="truncate">{a.purpose === "PLATFORM" ? "Platform (commission)" : (a.feeTypeCode ?? a.name)}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">{a.reference}</div>
                </div>
                <div className="text-right">
                  <Money minor={a.availableBalance} />
                  <div className="text-[11px] text-muted-foreground">{a.balanceUpdatedAt ? formatRelative(a.balanceUpdatedAt) : "not fetched"}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LatestPayments() {
  const q = useQuery({
    queryKey: qk.payments({ limit: 10 }),
    queryFn: () => call(api.GET("/v1/admin/payments", { params: { query: { limit: 10 } } })),
  });
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium">Latest payments</CardTitle>
        <Link href="/payments" className="text-xs text-muted-foreground hover:text-foreground">
          All payments →
        </Link>
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <LoadingBlock rows={5} />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data.items.length ? (
          <EmptyState title="No payments yet" />
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/payments/${p.id}`} className="hover:underline">
                        <DateTime iso={p.createdAt} />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <CopyValue value={p.paymentRef} />
                    </TableCell>
                    <TableCell className="max-w-40 truncate">{p.payer.fullName}</TableCell>
                    <TableCell>{p.feeTypeCode}</TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money minor={p.amount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Overview() {
  const me = useMe();
  const scope = useScopeNames(me.departments, me.faculties);
  const canOp = useCanOp();
  const anything = ["adminReconciliation", "adminReportsSummary", "adminListAccounts", "adminListPayments"].some((o) =>
    canOp(o as Parameters<typeof canOp>[0]),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={
          me.departmentScoped
            ? `Payments for ${[scope.faculties.join(", "), scope.departments.join(", ") || "no departments"].filter(Boolean).join(": ")}`
            : "Fee collections across UNIMAK"
        }
      />
      {!anything && <EmptyState title="Nothing to show for your role">Use the navigation to open the pages you have access to.</EmptyState>}
      <Can op="adminReconciliation">
        <Attention />
      </Can>
      <Can op="adminReportsSummary">
        <Collections />
      </Can>
      <div className="grid gap-3 xl:grid-cols-3">
        <Can op="adminListAccounts">
          <Balances />
        </Can>
        <Can op="adminListPayments">
          <div className={cn(canOp("adminListAccounts") && "xl:col-span-2")}>
            <LatestPayments />
          </div>
        </Can>
      </div>
    </div>
  );
}
