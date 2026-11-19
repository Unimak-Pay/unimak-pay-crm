"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, WalletCards } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { columnsFor, DataTable, minorSortValue } from "@/components/data-table";
import { CopyValue, Money } from "@/components/format";
import { GatedButton, RequireOp, useCanOp } from "@/components/permission";
import { PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatRelative } from "@/lib/time";

type Account = components["schemas"]["AccountListItem"];
type Provisioned = components["schemas"]["ProvisionedAccount"];

function RefreshButton({ a }: { a: Account }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => call(api.POST("/v1/admin/financial-accounts/{id}/refresh-balance", { params: { path: { id: a.id } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.accounts }),
  });
  return (
    <GatedButton op="adminRefreshBalance" size="icon-sm" variant="ghost" aria-label={`Refresh ${a.reference} balance from Monime`} onClick={() => m.mutate()} disabled={m.isPending}>
      {m.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
    </GatedButton>
  );
}

const col = columnsFor<Account>();
const columns = [
  col.accessor((a) => (a.purpose === "PLATFORM" ? "Platform" : (a.feeTypeCode ?? "")), {
    id: "account",
    header: "Account",
    cell: (c) => (
      <div>
        <div className="font-medium">{c.row.original.purpose === "PLATFORM" ? "Platform (commission)" : c.row.original.name}</div>
        <div className="text-[11px] text-muted-foreground">{c.row.original.feeTypeCode ?? "—"}</div>
      </div>
    ),
  }),
  col.accessor("reference", { header: "Reference", cell: (c) => <CopyValue value={c.getValue()} /> }),
  col.accessor("monimeId", { header: "Monime id", cell: (c) => <CopyValue value={c.getValue()} /> }),
  col.accessor((a) => a.uvan ?? "", { id: "uvan", header: "UVAN", cell: (c) => <CopyValue value={c.row.original.uvan} /> }),
  col.accessor((a) => minorSortValue(a.unsubmittedPayouts), {
    id: "unsubmitted",
    header: "Unsubmitted payouts",
    meta: { align: "right" },
    cell: (c) => (c.row.original.unsubmittedPayouts === "0" ? <span className="text-muted-foreground">—</span> : <Money minor={c.row.original.unsubmittedPayouts} />),
  }),
  col.accessor((a) => minorSortValue(a.availableBalance), {
    id: "balance",
    header: "Available balance",
    meta: { align: "right" },
    cell: (c) => (
      <div>
        <Money minor={c.row.original.availableBalance} className="font-medium" />
        <div className="text-[11px] text-muted-foreground" title={c.row.original.balanceUpdatedAt ?? undefined}>
          {c.row.original.balanceUpdatedAt ? <>as of {formatRelative(c.row.original.balanceUpdatedAt)}</> : "never fetched"}
        </div>
      </div>
    ),
  }),
  col.display({ id: "refresh", header: "", cell: (c) => <RefreshButton a={c.row.original} /> }),
];

function Page() {
  const qc = useQueryClient();
  const canOp = useCanOp();
  const q = useQuery({ queryKey: qk.accounts, queryFn: () => call(api.GET("/v1/admin/financial-accounts")) });
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<Provisioned[] | null>(null);
  const provision = useMutation({
    mutationFn: () => call(api.POST("/v1/admin/financial-accounts/provision")),
    meta: { inlineError: true },
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: qk.accounts });
      void qc.invalidateQueries({ queryKey: qk.feeTypes });
      toast.success(`${r.filter((x) => x.created).length} account(s) created`);
    },
  });
  const feeTypes = useQuery({ queryKey: qk.feeTypes, queryFn: () => call(api.GET("/v1/admin/fee-types")), enabled: canOp("adminFeeTypes") });
  const missing = feeTypes.data?.filter((t) => !t.account) ?? [];

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Our Monime financial accounts: one per fee type, plus the platform account that receives commission."
        actions={
          <>
            {canOp("adminCreatePayout") && (
              <Button asChild size="sm" variant="outline">
                <Link href="/treasury/payouts/new">New payout</Link>
              </Button>
            )}
            <GatedButton op="adminProvisionAccounts" size="sm" onClick={() => (provision.reset(), setConfirm(true))}>
              <WalletCards aria-hidden /> Create missing accounts
            </GatedButton>
          </>
        }
      />
      {result && (
        <Alert className="mb-3">
          <AlertTitle>Provisioning finished</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-0.5">
              {result.map((r) => (
                <li key={r.reference} className="font-mono text-xs">
                  {r.reference} · {r.created ? "created" : "already existed"}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <DataTable columns={columns} rows={q.data} getRowId={(a) => a.id} isLoading={q.isPending} error={q.error} onRetry={() => void q.refetch()} emptyTitle="No accounts yet" />
      <p className="mt-2 text-xs text-muted-foreground">Balances are the last value fetched from Monime. Use ↻ to fetch the current one.</p>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Create missing Monime accounts?"
        confirmLabel="Create accounts"
        onConfirm={() => provision.mutateAsync()}
      >
        <p>
          This creates a Monime financial account at Monime (live) for every fee type that has none, and the platform account if it is
          missing. Existing accounts are left alone; running it twice is safe.
        </p>
        {feeTypes.data && (
          <p>
            {missing.length ? (
              <>
                Missing now: <strong className="font-mono">{missing.map((t) => `unimak-fee-${t.code.toLowerCase()}`).join(", ")}</strong>
              </>
            ) : (
              "Every fee type already has an account."
            )}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

export function Accounts() {
  return (
    <RequireOp op="adminListAccounts">
      <Page />
    </RequireOp>
  );
}
