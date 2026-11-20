"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Money } from "@/components/format";
import { GatedButton } from "@/components/permission";
import { ErrorState, LoadingBlock } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSleSigned } from "@/lib/money";
import { applyConfirmText, plural, type RepriceReport, SKIP_REASONS } from "./reprice-text";

type Payer = RepriceReport["changes"][number]["payer"];

function PayerCell({ payer }: { payer: Payer }) {
  return (
    <div>
      <div>{payer.fullName}</div>
      <div className="font-mono text-[11px] text-muted-foreground">
        {payer.ref} · {payer.kind}
      </div>
    </div>
  );
}

/** Signed: "+SLE 50.00" / "-SLE 50.00" (negative means the payer owes less). */
function Difference({ minor }: { minor: string }) {
  return <span className="tabular-nums whitespace-nowrap">{formatSleSigned(minor)}</span>;
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-medium">{children}</div>
    </div>
  );
}

function Report({ report }: { report: RepriceReport }) {
  const { changes, skipped } = report;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="reprice-summary">
        <Stat label={report.applied ? "Changed" : "Would change"}>{changes.length}</Stat>
        <Stat label="Total difference">
          <Difference minor={report.totals.difference} />
        </Stat>
        <Stat label="Already at the current price">{report.unchanged}</Stat>
        <Stat label="Skipped">{skipped.length}</Stat>
      </div>

      {changes.length === 0 ? (
        <Alert>
          <CheckCircle2 aria-hidden />
          <AlertTitle>Everyone is already at the current price</AlertTitle>
          <AlertDescription>
            {skipped.length > 0 ? "Nothing to re-price. The obligations below were left alone and need a person to decide." : "Nothing to re-price."}
          </AlertDescription>
        </Alert>
      ) : (
        <section aria-label="Changes" className="space-y-1.5">
          <h3 className="text-sm font-medium">{report.applied ? "Re-priced" : "Changes"}</h3>
          <div className="max-h-72 overflow-auto rounded-md border">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Payer</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Proposed</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.map((c) => (
                  <TableRow key={c.obligationId}>
                    <TableCell>
                      <PayerCell payer={c.payer} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money minor={c.current} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money minor={c.proposed} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Difference minor={c.difference} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {skipped.length > 0 && (
        <section aria-label="Skipped" className="space-y-1.5">
          <h3 className="text-sm font-medium">Skipped ({skipped.length})</h3>
          <div className="max-h-56 overflow-auto rounded-md border">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Payer</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead>Why</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skipped.map((s) => (
                  <TableRow key={s.obligationId}>
                    <TableCell>
                      <PayerCell payer={s.payer} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money minor={s.current} />
                    </TableCell>
                    <TableCell title={s.reason}>{SKIP_REASONS[s.reason] ?? s.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}

export function RepriceDialog({ feeId, feeName, open, onOpenChange, onApplied }: { feeId: string; feeName: string; open: boolean; onOpenChange(o: boolean): void; onApplied?(): void }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const preview = useQuery({
    queryKey: qk.reprice(feeId),
    queryFn: () => call(api.GET("/v1/admin/fees/{id}/reprice", { params: { path: { id: feeId } } })),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const apply = useMutation({
    mutationFn: () => call(api.POST("/v1/admin/fees/{id}/reprice", { params: { path: { id: feeId } } })),
    meta: { inlineError: true },
    onSuccess: (r) => {
      toast.success(r.changes.length ? `Re-priced ${plural(r.changes.length, "obligation")}` : "Nothing needed re-pricing");
      void qc.invalidateQueries({ queryKey: qk.fee(feeId) });
      void qc.invalidateQueries({ queryKey: qk.auditRoot });
      onApplied?.();
    },
  });
  // After Apply, show what the server actually did (it decides again under lock).
  const report = apply.data ?? preview.data;

  function change(o: boolean) {
    if (apply.isPending) return;
    if (!o) apply.reset();
    onOpenChange(o);
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{apply.data ? `Re-priced ${feeName}` : "Re-price existing obligations"}</DialogTitle>
          <DialogDescription>
            {apply.data
              ? apply.data.changes.length
                ? `Ledger adjustments were added for ${plural(apply.data.changes.length, "payer")}. Running it again changes nothing.`
                : "Nothing was changed."
              : "Obligations keep the price they were created with. This is what moving them to the current rate rules would change. Nothing is saved until you apply."}
          </DialogDescription>
        </DialogHeader>
        {preview.isPending && !apply.data ? (
          <LoadingBlock rows={4} />
        ) : preview.error && !apply.data ? (
          <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
        ) : report ? (
          <Report report={report} />
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => change(false)}>
            Close
          </Button>
          {!apply.data && report && report.changes.length > 0 && (
            <GatedButton op="adminApplyReprice" onClick={() => setConfirming(true)} disabled={preview.isFetching}>
              Apply
            </GatedButton>
          )}
        </DialogFooter>
        {report && !apply.data && (
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={`Re-price ${feeName}?`}
            confirmLabel="Apply re-pricing"
            onConfirm={() => apply.mutateAsync()}
          >
            <p>{applyConfirmText(report)}</p>
            <p>The server checks every obligation again when you apply, so the result can differ slightly from this preview if a payment started meanwhile.</p>
          </ConfirmDialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Opens the re-pricing preview (`fees.manage`). The dialog is mounted separately, so it survives the button going away. */
export function RepriceButton({ onClick, variant = "outline" }: { onClick(): void; variant?: "outline" | "default" }) {
  return (
    <GatedButton op="adminPreviewReprice" size="sm" variant={variant} onClick={onClick}>
      <RefreshCcw aria-hidden /> Re-price existing obligations
    </GatedButton>
  );
}
