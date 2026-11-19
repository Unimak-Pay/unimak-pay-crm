"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Banknote, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { api, call } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { ServerError, FormField } from "@/components/form-dialog";
import { BackLink } from "@/components/history-link";
import { MoneyInput, toMinor, zSle } from "@/components/money-input";
import { GatedButton, RequireOp } from "@/components/permission";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { compareMinor, formatSle, sleInWords } from "@/lib/money";
import { formatRelative } from "@/lib/time";
import { classifyFailure, newIdempotencyKey } from "../payout-submission";

type Account = components["schemas"]["AccountListItem"];
type Bank = components["schemas"]["Bank"];

const schema = z.object({
  accountId: z.string().min(1, "Choose the account to pay from"),
  amount: zSle,
  bankProviderId: z.string().min(1, "Choose a bank"),
  accountNumber: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{4,34}$/, "4 to 34 digits")),
  accountName: z.string().trim().max(100),
  narration: z.string().trim().max(100),
});
type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

type Reviewed = FormOut & { minor: string; account: Account; bank: Bank };

function accountLabel(a: Account) {
  return a.purpose === "PLATFORM" ? "Platform (commission)" : `${a.feeTypeCode ?? a.name}`;
}

/** Step 1: enter the payout. Balance check on the client is advisory; the server re-checks. */
function PayoutForm({ accounts, banks, initial, onReview }: { accounts: Account[]; banks: Bank[]; initial?: FormIn; onReview(v: Reviewed): void }) {
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: initial ?? { accountId: "", amount: "", bankProviderId: "", accountNumber: "", accountName: "", narration: "" },
  });
  const accountId = useWatch({ control: form.control, name: "accountId" });
  const account = accounts.find((a) => a.id === accountId);
  const e = form.formState.errors;

  const submit = form.handleSubmit((v) => {
    const a = accounts.find((x) => x.id === v.accountId)!;
    const minor = toMinor(v.amount);
    if (a.availableBalance === null) {
      form.setError("accountId", { message: "This account's balance has never been fetched. Refresh it on the Accounts page first." });
      return;
    }
    if (compareMinor(minor, a.availableBalance) > 0) {
      form.setError("amount", { message: `More than the available balance (${formatSle(a.availableBalance)})` });
      return;
    }
    onReview({ ...v, minor, account: a, bank: banks.find((b) => b.providerId === v.bankProviderId)! });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormField label="Pay from" htmlFor="po-account" error={e.accountId?.message}>
        <Controller
          control={form.control}
          name="accountId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="po-account" className="w-full">
                <SelectValue placeholder="Choose an account…" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {accountLabel(a)} · {a.reference} · {a.availableBalance === null ? "balance unknown" : formatSle(a.availableBalance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      {account && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Available: <strong>{account.availableBalance === null ? "unknown" : formatSle(account.availableBalance)}</strong>
          {account.balanceUpdatedAt && ` (as of ${formatRelative(account.balanceUpdatedAt)})`}
          {account.unsubmittedPayouts !== "0" && ` · ${formatSle(account.unsubmittedPayouts)} in payouts not yet accepted by Monime`}
        </p>
      )}
      <FormField label="Amount" htmlFor="po-amount" error={e.amount?.message} hint="In leones, e.g. 1,500 or 1,500.50">
        <MoneyInput id="po-amount" placeholder="0.00" {...form.register("amount")} />
      </FormField>
      <FormField label="Bank" htmlFor="po-bank" error={e.bankProviderId?.message}>
        <Controller
          control={form.control}
          name="bankProviderId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="po-bank" className="w-full">
                <SelectValue placeholder="Choose a bank…" />
              </SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b.providerId} value={b.providerId}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Account number" htmlFor="po-number" error={e.accountNumber?.message}>
          <Input id="po-number" inputMode="numeric" autoComplete="off" className="font-mono" {...form.register("accountNumber")} />
        </FormField>
        <FormField label="Account name" htmlFor="po-name" error={e.accountName?.message} hint="As the bank holds it">
          <Input id="po-name" autoComplete="off" {...form.register("accountName")} />
        </FormField>
      </div>
      <FormField label="Narration" htmlFor="po-narr" error={e.narration?.message} hint="Shown on the bank statement (optional)">
        <Input id="po-narr" maxLength={100} {...form.register("narration")} />
      </FormField>
      <div className="flex justify-end">
        <Button type="submit">Review payout</Button>
      </div>
    </form>
  );
}

/** Step 2: restate everything; refresh the source balance; submit once. */
function Review({
  v,
  idempotencyKey,
  locked,
  onEdit,
  onSubmitted,
  onFailure,
}: {
  v: Reviewed;
  idempotencyKey: string;
  /** An earlier attempt may have reached Monime: only an unchanged retry is allowed. */
  locked: boolean;
  onEdit(): void;
  onSubmitted(id: string): void;
  onFailure(e: unknown): void;
}) {
  const qc = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const fresh = useQuery({
    queryKey: ["payout-review-balance", v.account.id],
    queryFn: () => call(api.POST("/v1/admin/financial-accounts/{id}/refresh-balance", { params: { path: { id: v.account.id } } })),
    staleTime: 0,
    gcTime: 0,
  });
  const balance = fresh.data?.availableBalance ?? v.account.availableBalance;
  const over = balance !== null && compareMinor(v.minor, balance) > 0;

  const submit = useMutation({
    mutationFn: () =>
      call(
        api.POST("/v1/admin/payouts", {
          body: {
            account: v.account.reference,
            amount: v.minor,
            bankProviderId: v.bankProviderId,
            accountNumber: v.accountNumber,
            ...(v.accountName && { accountName: v.accountName }),
            ...(v.narration && { narration: v.narration }),
            idempotencyKey,
          },
        }),
      ),
    meta: { inlineError: true },
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: qk.payoutsRoot });
      void qc.invalidateQueries({ queryKey: qk.accounts });
      onSubmitted(p.id);
    },
    onError: onFailure,
  });

  const rows: [string, React.ReactNode][] = [
    ["From", <span key="f">{accountLabel(v.account)} · <span className="font-mono">{v.account.reference}</span></span>],
    ["To bank", v.bank.name],
    ["Account number", <span key="n" className="font-mono">{v.accountNumber}</span>],
    ["Account name", v.accountName || <span key="an" className="text-muted-foreground">not given</span>],
    ["Narration", v.narration || <span key="na" className="text-muted-foreground">none</span>],
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-4 text-center">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">You are sending</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums">{formatSle(v.minor)}</div>
        <div className="mt-1 text-sm">{sleInWords(v.minor)}</div>
      </div>
      <dl className="divide-y rounded-md border text-sm">
        {rows.map(([k, val]) => (
          <div key={k} className="flex justify-between gap-4 px-3 py-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right">{val}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 px-3 py-2">
          <dt className="text-muted-foreground">Balance at Monime</dt>
          <dd className="text-right">
            {fresh.isPending ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden /> checking…
              </span>
            ) : (
              <>
                {balance === null ? "unknown" : formatSle(balance)}
                {fresh.error ? <span className="block text-xs text-muted-foreground">Could not refresh: {errorMessage(fresh.error)}</span> : null}
              </>
            )}
          </dd>
        </div>
      </dl>
      {over && (
        <Alert variant="destructive">
          <AlertTitle>The amount is more than the current balance</AlertTitle>
          <AlertDescription>Monime reports {formatSle(balance!)} available. Go back and lower the amount.</AlertDescription>
        </Alert>
      )}
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={confirmed} onCheckedChange={(c) => setConfirmed(c === true)} className="mt-0.5" disabled={submit.isPending} />
        <span>
          I checked the bank, account number and amount. This sends real money from {v.account.reference} and cannot be undone here.
        </span>
      </label>
      {submit.error ? <ServerError error={submit.error} /> : null}
      {locked && (
        <Alert>
          <AlertTriangle aria-hidden />
          <AlertTitle>The last attempt may have reached Monime</AlertTitle>
          <AlertDescription>
            Retry with the same details: it uses the same idempotency key, so Monime will not pay twice. Changing the payout is
            disabled until it goes through or is refused.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" onClick={onEdit} disabled={submit.isPending || locked}>
          <ArrowLeft aria-hidden /> Change details
        </Button>
        <GatedButton
          op="adminCreatePayout"
          onClick={() => submit.mutate()}
          disabled={!confirmed || submit.isPending || over || fresh.isPending}
        >
          {submit.isPending ? <Loader2 className="animate-spin" aria-hidden /> : locked ? <RefreshCw aria-hidden /> : <Banknote aria-hidden />}
          {submit.isPending ? "Sending…" : locked ? `Retry ${formatSle(v.minor)} payout` : `Send ${formatSle(v.minor)}`}
        </GatedButton>
      </div>
      <p className="text-right font-mono text-[11px] text-muted-foreground">idempotency key {idempotencyKey}</p>
    </div>
  );
}

function Page() {
  const router = useRouter();
  const accounts = useQuery({ queryKey: qk.accounts, queryFn: () => call(api.GET("/v1/admin/financial-accounts")) });
  const banks = useQuery({ queryKey: qk.banks, queryFn: () => call(api.GET("/v1/admin/banks")), staleTime: 5 * 60_000 });
  // One key per submission; minted when the form opens.
  const [idempotencyKey, setKey] = useState(newIdempotencyKey);
  const [reviewed, setReviewed] = useState<Reviewed | null>(null);
  const [draft, setDraft] = useState<FormIn | undefined>(undefined);
  const [locked, setLocked] = useState(false);

  // Leaving with a possibly-sent payout: warn.
  useEffect(() => {
    if (!locked) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [locked]);

  if (accounts.isPending || banks.isPending) return <LoadingBlock rows={6} />;
  if (accounts.error) return <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />;
  if (banks.error) return <ErrorState error={banks.error} onRetry={() => void banks.refetch()} />;
  const payable = banks.data.filter((b) => b.canPayTo && b.active);

  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/treasury/payouts">Payouts</BackLink>
      <PageHeader title="New payout" description="Withdraw from one of our Monime accounts to a bank account. Real money." />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{reviewed ? "2 · Review and confirm" : "1 · Payout details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {reviewed ? (
            <Review
              v={reviewed}
              idempotencyKey={idempotencyKey}
              locked={locked}
              onEdit={() => setReviewed(null)}
              onSubmitted={(id) => router.replace(`/treasury/payouts/${id}?submitted=1`)}
              onFailure={(e) => {
                if (classifyFailure(e) === "uncertain") setLocked(true);
                else {
                  // Nothing was created: the next (possibly changed) attempt gets a fresh key.
                  setLocked(false);
                  setKey(newIdempotencyKey());
                }
              }}
            />
          ) : (
            <PayoutForm
              accounts={accounts.data}
              banks={payable}
              initial={draft}
              onReview={(v) => {
                setDraft({
                  accountId: v.accountId,
                  amount: v.amount,
                  bankProviderId: v.bankProviderId,
                  accountNumber: v.accountNumber,
                  accountName: v.accountName,
                  narration: v.narration,
                });
                setReviewed(v);
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function NewPayout() {
  return (
    <RequireOp op="adminCreatePayout">
      <Page />
    </RequireOp>
  );
}
