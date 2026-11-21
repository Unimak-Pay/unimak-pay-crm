"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Link2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, call } from "@/api/client";
import { isApiError } from "@/api/errors";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { CopyValue, DateTime, Day, Money, StatusBadge } from "@/components/format";
import { BackLink } from "@/components/history-link";
import { RequireOp, useCanOp } from "@/components/permission";
import { EmptyState, ErrorState, Field, Fields, LoadingBlock, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSle, formatSleSigned } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatRate } from "../drill";
import { withRunningBalance } from "./ledger";
import { OverdueFlag, StandingBadge } from "../shared";

type Detail = components["schemas"]["PayerDetail"];
type Obligation = Detail["obligations"][number];
type Entry = Obligation["entries"][number];

const ENTRY_LABEL: Record<Entry["type"], string> = { CHARGE: "Charged", PAYMENT: "Paid", ADJUSTMENT: "Adjusted", REFUND: "Refunded" };
const ENTRY_DOT: Record<Entry["type"], string> = {
  CHARGE: "bg-foreground",
  PAYMENT: "bg-emerald-600",
  ADJUSTMENT: "bg-amber-500",
  REFUND: "bg-red-600",
};

/** Ledger entries oldest first, each with the balance after it (the obligation's balance is their sum). */
function Ledger({ entries }: { entries: Entry[] }) {
  return (
    <ol className="relative space-y-3 border-l pl-4 text-sm" aria-label="Ledger">
      {withRunningBalance(entries).map((e) => (
        <li key={e.id} data-testid="ledger-entry" data-type={e.type}>
          <span className={cn("absolute -left-[5px] mt-1.5 size-2.5 rounded-full", ENTRY_DOT[e.type])} aria-hidden />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-medium">
              {ENTRY_LABEL[e.type]} <span className="tabular-nums">{formatSleSigned(e.amount)}</span>
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">balance {formatSle(e.balanceAfter)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            <DateTime iso={e.createdAt} /> · {e.createdBy}
            {e.memo && <> · {e.memo}</>}
            {e.paymentId && (
              <>
                {" · "}
                <Link href={`/payments/${e.paymentId}`} className="underline underline-offset-2">
                  payment
                </Link>
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Payments({ payments }: { payments: Obligation["payments"] }) {
  if (!payments.length) return <p className="text-sm text-muted-foreground">No payments started yet.</p>;
  return (
    <div className="overflow-x-auto">
      <Table className="text-[13px]" aria-label="Payments">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Started</TableHead>
            <TableHead>Ref</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Receipt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => (
            <TableRow key={p.id} data-testid="obligation-payment">
              <TableCell>
                <DateTime iso={p.createdAt} />
              </TableCell>
              <TableCell>
                <Link href={`/payments/${p.id}`} className="font-mono text-xs underline-offset-2 hover:underline">
                  {p.paymentRef}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {p.channel} <span className="text-xs text-muted-foreground">· {p.collectionMethod.replace(/_/g, " ").toLowerCase()}</span>
              </TableCell>
              <TableCell>
                <StatusBadge status={p.status} />
                {p.failureReason && <div className="text-[11px] text-destructive">{p.failureReason}</div>}
              </TableCell>
              <TableCell className="text-right">
                <Money minor={p.amount} />
              </TableCell>
              <TableCell>
                {p.receiptNumber ? (
                  <Link href={`/payments/${p.id}`} className="font-mono text-xs underline underline-offset-2">
                    {p.receiptNumber}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ObligationCard({ o }: { o: Obligation }) {
  const overpaid = BigInt(o.balance) < 0n;
  return (
    <Card data-testid="obligation-card" aria-labelledby={`ob-${o.id}`}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle id={`ob-${o.id}`} className="text-sm font-medium">
            {o.fee.name}
          </CardTitle>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {o.fee.feeTypeCode} · {o.fee.period}
            {o.fee.status !== "ACTIVE" && <> · fee {o.fee.status.toLowerCase()}</>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge status={o.status} />
          {o.overdue && <OverdueFlag />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Fields className="lg:grid-cols-5">
          <Field label="Due">{o.fee.dueDate ? <Day day={o.fee.dueDate.slice(0, 10)} /> : <span className="text-muted-foreground">No due date</span>}</Field>
          <Field label="Billed">
            <Money minor={o.billed} />
            {o.billed !== o.amount && <div className="text-[11px] text-muted-foreground">priced {formatSle(o.amount)}</div>}
          </Field>
          <Field label="Collected">
            <Money minor={o.collected} />
          </Field>
          <Field label={overpaid ? "Overpaid" : "Balance"}>
            <Money minor={overpaid ? o.balance.slice(1) : o.balance} className={cn("font-semibold", overpaid && "text-amber-700 dark:text-amber-400")} />
          </Field>
          <Field label="Minimum next payment">{BigInt(o.balance) > 0n ? <Money minor={o.minInstalment} /> : <span className="text-muted-foreground">Nothing to pay</span>}</Field>
        </Fields>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Ledger</h3>
            <Ledger entries={o.entries} />
          </section>
          <section>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Payments</h3>
            <Payments payments={o.payments} />
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

function Receipts({ d }: { d: Detail }) {
  const feeOf = new Map(d.obligations.map((o) => [o.id, o.fee.name]));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Receipts</CardTitle>
      </CardHeader>
      <CardContent>
        {d.receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No receipts yet.</p>
        ) : (
          <Table className="text-[13px]" aria-label="Receipts">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Number</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.receipts.map((r) => (
                <TableRow key={r.id} data-testid="receipt-row">
                  <TableCell>
                    <Link href={`/payments/${r.paymentId}`} className="font-mono text-xs underline underline-offset-2">
                      {r.number}
                    </Link>
                  </TableCell>
                  <TableCell>{feeOf.get(r.obligationId) ?? "—"}</TableCell>
                  <TableCell>
                    <DateTime iso={r.issuedAt} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money minor={r.amount} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PortalEvents({ d }: { d: Detail }) {
  const canOp = useCanOp();
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium">From the portal</CardTitle>
        {canOp("adminPortalEvents") && (
          <Link href={`/portal/events?ref=${encodeURIComponent(d.payer.ref)}`} className="inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline">
            Event log <ArrowRight className="size-3" aria-hidden />
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {d.portalEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events for {d.payer.ref} in the last 90 days.</p>
        ) : (
          <ul className="space-y-2 text-sm" aria-label="Portal events">
            {d.portalEvents.map((e) => (
              <li key={e.id} data-testid="payer-portal-event" className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <StatusBadge status={e.result} />
                <DateTime iso={e.receivedAt} className="text-xs" />
                <span className="font-mono text-[11px] text-muted-foreground">{e.type}</span>
                {e.result === "REJECTED" && e.error && <span className="basis-full text-xs text-destructive">{e.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function View({ id }: { id: string }) {
  const q = useQuery({ queryKey: qk.payer(id), queryFn: () => call(api.GET("/v1/admin/payers/{id}", { params: { path: { id } } })), retry: (n, e) => !(isApiError(e) && e.status === 404) && n < 2 });

  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.error) {
    if (isApiError(q.error) && q.error.status === 404)
      return (
        <div className="max-w-5xl">
          <BackLink href="/students">Students</BackLink>
          <EmptyState title="Student not found">They may be outside your departments.</EmptyState>
        </div>
      );
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  }
  const d = q.data;
  const p = d.payer;
  const t = d.totals;
  const student = p.kind === "STUDENT";

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <BackLink href="/students">Students</BackLink>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {p.fullName}
              <StandingBadge standing={t.standing} />
              {t.overdue && <OverdueFlag />}
            </span>
          }
          description={
            <span className="flex flex-wrap items-center gap-x-2">
              <Badge variant="outline" className="text-[11px]">
                {student ? "Student" : "Applicant"}
              </Badge>
              <span className="font-mono">{p.ref}</span>
              {(p.enrolmentStatus ?? p.applicantStatus) && <StatusBadge status={(p.enrolmentStatus ?? p.applicantStatus)!} />}
            </span>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Record</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Fields>
              <Field label="Phone">
                <CopyValue value={p.phone} className="text-sm" />
              </Field>
              <Field label={student ? "Student ID" : "Application ref"}>
                <CopyValue value={p.ref} />
              </Field>
              <Field label="Program">{p.programCode}</Field>
              <Field label="Department">
                {p.departmentName ?? p.department ?? "—"}
                {p.facultyName && <div className="text-xs text-muted-foreground">{p.facultyName}</div>}
              </Field>
              {student && (
                <Field label="Level">
                  {p.level ?? "—"}
                  {p.finalYear && <span className="text-xs text-muted-foreground"> · final year</span>}
                </Field>
              )}
              <Field label="Residency">{p.residency === "INTERNATIONAL" ? "International" : "Local"}</Field>
              <Field label="Intake">{p.intake}</Field>
              <Field label="Portal last updated">
                <DateTime iso={p.portalUpdatedAt} />
              </Field>
              {(d.linked.applicant || d.linked.student) && (
                <Field label={d.linked.applicant ? "Applied as" : "Now a student"}>
                  <Link
                    href={`/students/${(d.linked.applicant ?? d.linked.student)!.id}`}
                    className="inline-flex items-center gap-1 font-mono text-xs underline underline-offset-2"
                    data-testid="linked-payer"
                  >
                    <Link2 className="size-3" aria-hidden />
                    {(d.linked.applicant ?? d.linked.student)!.ref}
                  </Link>
                </Field>
              )}
            </Fields>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Totals</CardTitle>
          </CardHeader>
          <CardContent>
            <Fields className="sm:grid-cols-2 lg:grid-cols-2">
              <Field label="Billed">
                <Money minor={t.billed} />
              </Field>
              <Field label="Collected">
                <Money minor={t.collected} />
                <div className="text-xs text-muted-foreground">{formatRate(t.collectionRate)} of billed</div>
              </Field>
              <Field label="Outstanding">
                <Money minor={t.outstanding} className="text-base font-semibold" />
              </Field>
              <Field label="Obligations">{t.obligations}</Field>
            </Fields>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3" aria-label="Obligations">
        <h2 className="text-sm font-medium">Obligations</h2>
        {d.obligations.length === 0 ? (
          <EmptyState title="Nothing billed" className="rounded-md border">
            {student ? "No active fee matched this student. Check the fees' rate and eligibility rules." : "No fee matched this applicant."}
          </EmptyState>
        ) : (
          d.obligations.map((o) => <ObligationCard key={o.id} o={o} />)
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Receipts d={d} />
        <PortalEvents d={d} />
      </div>
    </div>
  );
}

export function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireOp op="adminGetPayer">
      <View id={id} />
    </RequireOp>
  );
}
