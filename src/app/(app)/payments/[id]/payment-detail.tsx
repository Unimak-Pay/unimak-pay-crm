"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { isApiError } from "@/api/errors";
import { CopyValue, DateTime, Money, PAYMENT_STATUS_LABEL, PaymentStatusBadge, StatusBadge } from "@/components/format";
import { BackLink, HistoryLink } from "@/components/history-link";
import { GatedButton, RequireOp, useCanOp } from "@/components/permission";
import { EmptyState, ErrorState, Field, Fields, LoadingBlock, PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSle } from "@/lib/money";

/** Not settled yet: "Check with Monime" applies. */
const OPEN = new Set(["INITIATED", "PENDING", "PROCESSING"]);

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
  const q = useQuery({
    queryKey: qk.payment(id),
    queryFn: () => call(api.GET("/v1/admin/payments/{id}", { params: { path: { id } } })),
    retry: (n, e) => !(isApiError(e) && e.status === 404) && n < 2,
  });
  const [result, setResult] = useState<components["schemas"]["PaymentReconcileResult"] | null>(null);
  const reconcile = useMutation({
    mutationFn: () => call(api.POST("/v1/admin/payments/{id}/reconcile", { params: { path: { id } } })),
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: qk.paymentsRoot });
      void qc.invalidateQueries({ queryKey: qk.reconciliation });
    },
  });

  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.error) {
    // unpaid payments are deleted after 7 days, or when another payment for the same fee completes
    if (isApiError(q.error) && q.error.status === 404)
      return (
        <div className="max-w-5xl">
          <BackLink href="/payments">Payments</BackLink>
          <EmptyState title="This payment was removed because it was never paid" className="rounded-md border">
            Unpaid payments are deleted after 7 days, or as soon as another payment for the same fee is paid. The Audit log keeps what it was.
          </EmptyState>
        </div>
      );
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  }
  const p = q.data;
  const open = OPEN.has(p.status);
  // only rows from before payments stopped expiring can have completed after expiresAt
  const late = p.completedAt && p.completedAt > p.expiresAt;

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <BackLink href="/payments">Payments</BackLink>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              Payment <span className="font-mono">{p.paymentRef}</span> <PaymentStatusBadge status={p.status} />
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
        <Alert data-testid="monime-check">
          <AlertTitle>Checked with Monime</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {result.before === result.after ? (
              <>
                <PaymentStatusBadge status={result.after} />
                <span className="text-muted-foreground">
                  Monime has no completion for this payment yet, so it stays {PAYMENT_STATUS_LABEL[result.after].toLowerCase()}. Checking changes nothing:
                  only Monime&apos;s confirmation (or the nightly reconciliation) marks a payment paid.
                </span>
              </>
            ) : (
              <>
                <PaymentStatusBadge status={result.before} /> <ArrowRight className="size-3" aria-hidden /> <PaymentStatusBadge status={result.after} />
                <span className="text-muted-foreground">Monime&apos;s confirmation arrived meanwhile.</span>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      {p.status === "EXPIRED" && (
        <p className="text-xs text-muted-foreground">
          Made before 28 Nov 2026, when payments still expired after 15 minutes. If Monime completes it late, it is still applied.
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
                ...(p.processingAt ? [{ label: "Processing", at: p.processingAt, note: "Monime started collecting" }] : []),
                ...(p.completedAt
                  ? [{ label: "Paid", at: p.completedAt, note: late ? "Late settlement: completed after its old 15-minute expiry" : undefined }]
                  : []),
                ...(p.status === "FAILED" ? [{ label: "Failed", at: p.updatedAt }] : []),
                ...(p.status === "EXPIRED" ? [{ label: "Expired (old rule)", at: p.expiresAt, muted: true }] : []),
                // awaiting payment: removed if nobody pays (a PROCESSING one never is)
                ...(p.status === "PENDING" || p.status === "INITIATED" ? [{ label: "Deleted if unpaid on", at: p.expiresAt, muted: true }] : []),
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
