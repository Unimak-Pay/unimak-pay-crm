"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { api, call } from "@/api/client";
import { errorMessage, isApiError } from "@/api/errors";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Money } from "@/components/format";
import { MoneyInput, toMajorInput } from "@/components/money-input";
import { GatedButton, useCanOp } from "@/components/permission";
import { EmptyState } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compareMinor, formatSle, parseSleInput } from "@/lib/money";
import { AnyCell, describeMatchers, EMPTY_MATCHERS, fromMatchers, MatcherInputs, matcherErrors, specificity, toMatchers, type MatcherValues } from "./matchers";

type RateRule = components["schemas"]["RateRule"];

/** One editable row: used to add a rule and to edit an existing one. */
function RuleEditor({
  feeId,
  rule,
  onDone,
}: {
  feeId: string;
  rule?: RateRule;
  onDone(): void;
}) {
  const qc = useQueryClient();
  const [values, setValues] = useState<MatcherValues>(rule ? fromMatchers(rule) : EMPTY_MATCHERS);
  const [amount, setAmount] = useState(rule ? toMajorInput(rule.amount) : "");
  const [errors, setErrors] = useState<Partial<Record<keyof MatcherValues | "amount", string>>>({});
  const m = useMutation({
    mutationFn: (body: components["schemas"]["Matchers"] & { amount: string }) =>
      rule
        ? call(api.PUT("/v1/admin/fees/{id}/rate-rules/{ruleId}", { params: { path: { id: feeId, ruleId: rule.id } }, body }))
        : call(api.POST("/v1/admin/fees/{id}/rate-rules", { params: { path: { id: feeId } }, body })),
    meta: { inlineError: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.fee(feeId) });
      void qc.invalidateQueries({ queryKey: qk.feesRoot });
      onDone();
    },
  });

  function save() {
    const me = matcherErrors(values) ?? {};
    const a = parseSleInput(amount);
    const errs = { ...me, ...(a.ok ? {} : { amount: a.error }) };
    setErrors(errs);
    if (Object.keys(errs).length || !a.ok) return;
    m.mutate({ ...toMatchers(values), amount: a.minor });
  }

  const ambiguous = isApiError(m.error) && m.error.code === "AMBIGUOUS_RATE_RULE";
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40 align-top">
        <MatcherInputs
          idPrefix={rule?.id ?? "new-rate"}
          values={values}
          onChange={(p) => setValues((v) => ({ ...v, ...p }))}
          errors={errors}
          disabled={m.isPending}
          wrap={(f, k) => (
            <TableCell key={k} className="py-1.5">
              {f}
            </TableCell>
          )}
        />
        <TableCell className="w-44">
          <MoneyInput
            aria-label="Amount"
            value={amount}
            placeholder="4,500.00"
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            disabled={m.isPending}
            className="h-8 text-xs"
          />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
        </TableCell>
        <TableCell className="w-24 whitespace-nowrap text-right">
          <Button size="icon-sm" onClick={save} disabled={m.isPending} aria-label={rule ? "Save rule" : "Add rule"}>
            {m.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onDone} disabled={m.isPending} aria-label="Cancel">
            <X aria-hidden />
          </Button>
        </TableCell>
      </TableRow>
      {m.error ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={7} className="pt-0">
            <Alert variant="destructive">
              <AlertTitle>{ambiguous ? "This rule would make some payers' price ambiguous" : "The rule was not saved"}</AlertTitle>
              <AlertDescription>
                {errorMessage(m.error)}
                {ambiguous && <p className="mt-1">Add the tie-breaker rule it names first, then try this one again.</p>}
              </AlertDescription>
            </Alert>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

export function RateRules({ feeId, rules }: { feeId: string; rules: RateRule[] }) {
  const qc = useQueryClient();
  const canOp = useCanOp();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [deleting, setDeleting] = useState<RateRule | null>(null);
  const del = useMutation({
    mutationFn: (r: RateRule) => call(api.DELETE("/v1/admin/fees/{id}/rate-rules/{ruleId}", { params: { path: { id: feeId, ruleId: r.id } } })),
    meta: { inlineError: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.fee(feeId) });
      void qc.invalidateQueries({ queryKey: qk.feesRoot });
    },
  });
  // Most specific first, then by amount: the order the backend matches in.
  const sorted = [...rules].sort((a, b) => specificity(b) - specificity(a) || compareMinor(b.amount, a.amount));
  const canEdit = canOp("adminAddRateRule");

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        The most specific matching rule sets the price. Empty matchers mean &ldquo;any&rdquo;. A rule that would leave some payer with two
        equally specific prices is refused until the tie-breaker exists.
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow>
              <TableHead>Program</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Residency</TableHead>
              <TableHead>Intake</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && editing !== "new" && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7}>
                  <EmptyState title="No rate rules">A fee needs at least one rate rule before it can be activated.</EmptyState>
                </TableCell>
              </TableRow>
            )}
            {sorted.map((r) =>
              editing === r.id ? (
                <RuleEditor key={r.id} feeId={feeId} rule={r} onDone={() => setEditing(null)} />
              ) : (
                <TableRow key={r.id}>
                  <TableCell>
                    <AnyCell value={r.programCode} />
                  </TableCell>
                  <TableCell>
                    <AnyCell value={r.department} />
                  </TableCell>
                  <TableCell>
                    <AnyCell value={r.level} />
                  </TableCell>
                  <TableCell>
                    <AnyCell value={r.residency?.toLowerCase()} />
                  </TableCell>
                  <TableCell>
                    <AnyCell value={r.intake} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money minor={r.amount} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <GatedButton op="adminUpdateRateRule" size="icon-sm" variant="ghost" aria-label="Edit rule" onClick={() => setEditing(r.id)} disabled={editing !== null}>
                      <Pencil aria-hidden />
                    </GatedButton>
                    <GatedButton op="adminDeleteRateRule" size="icon-sm" variant="ghost" aria-label="Delete rule" onClick={() => (del.reset(), setDeleting(r))} disabled={editing !== null}>
                      <Trash2 aria-hidden />
                    </GatedButton>
                  </TableCell>
                </TableRow>
              ),
            )}
            {editing === "new" && <RuleEditor feeId={feeId} onDone={() => setEditing(null)} />}
          </TableBody>
        </Table>
      </div>
      {canEdit && editing === null && (
        <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
          <Plus aria-hidden /> Add rate rule
        </Button>
      )}
      {!canEdit && <GatedButton op="adminAddRateRule" size="sm" variant="outline">Add rate rule</GatedButton>}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this rate rule?"
        confirmLabel="Delete rule"
        destructive
        onConfirm={() => del.mutateAsync(deleting!)}
      >
        {deleting && (
          <p>
            Payers matching <strong>{describeMatchers(deleting)}</strong> will no longer be priced at <strong>{formatSle(deleting.amount)}</strong>; the next
            most specific rule applies to new obligations. The server refuses if this rule breaks a tie.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
