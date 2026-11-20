"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import { CopyValue, DateTime, Money, StatusBadge } from "@/components/format";
import { BackLink, HistoryLink } from "@/components/history-link";
import { GatedButton, RequireOp, useCanOp } from "@/components/permission";
import { ErrorState, Field, Fields, LoadingBlock, PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSle } from "@/lib/money";

const OPEN = new Set(["INITIATED", "PENDING"]);

function Timeline({ items }: { items: { label: string; at: string | null; note?: React.ReactNode; muted?: boolean }[] }) {
  return (
    <ol className="relative space-y-3 border-l pl-4 text-sm">
      {items.map((i) => (
        <li key={i.label} className={i.muted ? "text-muted-foreground" : undefined}>
          <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border bg-background" aria-hidden />
          <div className="font-medium">{i.label}</div>
          <div className="text-xs">{i.at ? <DateTime iso={i.at} /> : "—"}</div>
          {i.note && <div className="text-xs text-muted-foreground">{i.note}</div>}
        </li>
      ))}
    </ol>
  );
}

function Detail({ id }: { id: string }) {
  const qc = useQueryClient();
  const canOp = useCanOp();
  const q = useQuery({ queryKey: qk.payment(id), queryFn: () => call(api.GET("/v1/admin/payments/{id}", { params: { path: { id } } })) });
  const [result, setResult] = useState<{ before: string; after: string } | null>(null);
  const reconcile = useMutation({
    mutationFn: () => call(api.POST("/v1/admin/payments/{id}/reconcile", { params: { path: { id } } })),
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: qk.paymentsRoot });
      void qc.invalidateQueries({ queryKey: qk.reconciliation });
    },
  });

  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const p = q.data;
  const open = OPEN.has(p.status);
  const late = p.completedAt && p.completedAt > p.expiresAt;

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <BackLink href="/payments">Payments</BackLink>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              Payment <span className="font-mono">{p.paymentRef}</span> <StatusBadge status={p.status} />
            </span>
          }
          description={
            <>
              {formatSle(p.amount)} · {p.feeName} · {p.payer.fullName}
            </>
          }
          actions={
            <>
              <HistoryLink entity="Payment" entityId={p.id} />
              {open && (
                <GatedButton op="adminReconcilePayment" size="sm" onClick={() => reconcile.mutate()} disabled={reconcile.isPending}>
                  {reconcile.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                  Check with Monime
                </GatedButton>
              )}
            </>
          }
        />
      </div>

      {result && (
        <Alert>
          <AlertTitle>Checked with Monime</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <StatusBadge status={result.before} /> <ArrowRight className="size-3" aria-hidden /> <StatusBadge status={result.after} />
            <span className="text-muted-foreground">
              {result.before === result.after
                ? "No change. Completion only ever comes from Monime's webhook."
                : "The payment code had expired or was cancelled, so the payment is closed."}
            </span>
          </AlertDescription>
        </Alert>
      )}
      {p.status === "EXPIRED" && (
        <p className="text-xs text-muted-foreground">
          Expired is not final for money: if Monime completes it late, it is still applied (late settlement).
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Fields>
              <Field label="Amount">
                <Money minor={p.amount} className="font-semibold" />
              </Field>
              <Field label="Monime fee">
                <Money minor={p.monimeFee} />
              </Field>
              <Field label="Platform fee">
                <Money minor={p.platformFee} />
              </Field>
              <Field label="Net to fee account">
                <Money minor={p.netAmount} />
              </Field>
              <Field label="Channel">
                {p.channel} · {p.collectionMethod.replace(/_/g, " ").toLowerCase()}
              </Field>
              <Field label="Payer phone">
                <span className="font-mono">{p.payerPhone ?? "—"}</span>
              </Field>
            </Fields>
            <Fields>
              <Field label="Payment ref (payer quotes this)">
                <CopyValue value={p.paymentRef} />
              </Field>
              <Field label="Monime order number">
                <CopyValue value={p.monimeOrderNumber} />
              </Field>
              <Field label="Monime payment id">
                <CopyValue value={p.monimePaymentId} />
              </Field>
              <Field label="Monime payment code">
                <CopyValue value={p.monimeRef} />
              </Field>
              <Field label="Receipt number">
                <CopyValue value={p.receiptNumber} />
              </Field>
              <Field label="Payment id">
                <CopyValue value={p.id} truncate />
              </Field>
              {p.ussdCode && (
                <Field label="USSD code">
                  <CopyValue value={p.ussdCode} />
                </Field>
              )}
              {p.failureReason && (
                <Field label="Failure reason" className="sm:col-span-2">
                  <span className="text-destructive">{p.failureReason}</span>
                </Field>
              )}
            </Fields>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <Timeline
              items={[
                { label: "Created", at: p.createdAt },
                {
                  label: open && p.expiresAt > new Date().toISOString() ? "Expires" : "Hold expired",
                  at: p.expiresAt,
                  muted: !open,
                  note: open && p.expiresAt <= new Date().toISOString() ? "Still open past expiry: the expiry job will close it" : undefined,
                },
                ...(p.completedAt
                  ? [{ label: "Completed", at: p.completedAt, note: late ? "Late settlement: completed after the hold expired" : undefined }]
                  : []),
                ...(p.status === "FAILED" || p.status === "EXPIRED" ? [{ label: p.status === "FAILED" ? "Failed" : "Expired", at: p.updatedAt }] : []),
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Payer</CardTitle>
          </CardHeader>
          <CardContent>
            <Fields className="sm:grid-cols-1 lg:grid-cols-1">
              <Field label="Name">{p.payer.fullName}</Field>
              <Field label={p.payer.kind === "APPLICANT" ? "Application ref" : "Student ID"}>
                <CopyValue value={p.payer.ref} />
              </Field>
              <Field label="Program">{p.payer.programCode}</Field>
              <Field label="Department">
                {p.payer.departmentName ?? p.payer.department ?? "—"}
                {p.payer.department && p.payer.departmentName && p.payer.departmentName !== p.payer.department && (
                  <span className="ml-1 font-mono text-xs text-muted-foreground">{p.payer.department}</span>
                )}
              </Field>
              <Field label="Faculty">{p.payer.facultyName ?? (p.payer.department ? "No faculty yet" : "—")}</Field>
              {canOp("adminListPayments") && (
                <Field label="Other payments">
                  <Link className="text-sm underline-offset-2 hover:underline" href={`/payments?payerRef=${encodeURIComponent(p.payer.ref)}`}>
                    All payments by this payer →
                  </Link>
                </Field>
              )}
            </Fields>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Fee</CardTitle>
          </CardHeader>
          <CardContent>
            <Fields className="sm:grid-cols-1 lg:grid-cols-1">
              <Field label="Fee">{p.feeName}</Field>
              <Field label="Fee type">{p.feeTypeCode}</Field>
              <Field label="Obligation">
                <CopyValue value={p.obligationId} truncate />
              </Field>
            </Fields>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Ledger &amp; commission</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {p.ledgerEntry ? (
              <Fields className="sm:grid-cols-1 lg:grid-cols-1">
                <Field label="Ledger entry">
                  {p.ledgerEntry.type} <Money minor={p.ledgerEntry.amount} signed /> · <DateTime iso={p.ledgerEntry.createdAt} />
                </Field>
                {p.ledgerEntry.memo && <Field label="Memo">{p.ledgerEntry.memo}</Field>}
              </Fields>
            ) : (
              <p className="text-muted-foreground">No ledger entry (only completed payments post one).</p>
            )}
            {p.commissionTransfer ? (
              <Fields className="sm:grid-cols-1 lg:grid-cols-1">
                <Field label="Commission transfer">
                  <span className="flex flex-wrap items-center gap-2">
                    <Money minor={p.commissionTransfer.amount} /> <StatusBadge status={p.commissionTransfer.status} />
                    {canOp("adminGetTransfer") && (
                      <Link className="underline-offset-2 hover:underline" href={`/treasury/transfers/${p.commissionTransfer.id}`}>
                        Open →
                      </Link>
                    )}
                  </span>
                </Field>
                {p.commissionTransfer.failureMessage && (
                  <Field label="Transfer failure">
                    <span className="text-destructive">{p.commissionTransfer.failureMessage}</span>
                  </Field>
                )}
              </Fields>
            ) : canOp("adminListTransfers") ? (
              <p className="text-muted-foreground">No commission transfer yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function PaymentDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireOp op="adminGetPayment">
      <Detail id={id} />
    </RequireOp>
  );
}
