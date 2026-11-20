"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { departmentLabel, useAcademics } from "@/components/academics";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ServerError } from "@/components/form-dialog";
import { GatedButton } from "@/components/permission";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnyCell, DepartmentCell, describeMatchers, EMPTY_MATCHERS, MatcherInputs, matcherErrors, toMatchers, type MatcherValues } from "./matchers";

type Rule = components["schemas"]["EligibilityRule"];
const ANY = "__any__";

export function EligibilityRules({ feeId, rules, payerKind }: { feeId: string; rules: Rule[]; payerKind: string }) {
  const qc = useQueryClient();
  const { departments } = useAcademics();
  const [values, setValues] = useState<MatcherValues>(EMPTY_MATCHERS);
  const [finalYear, setFinalYear] = useState<"" | "true" | "false">("");
  const [errors, setErrors] = useState<Partial<Record<keyof MatcherValues, string>>>({});
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.fee(feeId) });
  };
  const add = useMutation({
    mutationFn: () =>
      call(
        api.POST("/v1/admin/fees/{id}/eligibility-rules", {
          params: { path: { id: feeId } },
          body: { ...toMatchers(values), finalYear: finalYear === "" ? null : finalYear === "true" },
        }),
      ),
    meta: { inlineError: true },
    onSuccess: () => {
      invalidate();
      setValues(EMPTY_MATCHERS);
      setFinalYear("");
    },
  });
  const del = useMutation({
    mutationFn: (r: Rule) => call(api.DELETE("/v1/admin/fees/{id}/eligibility-rules/{ruleId}", { params: { path: { id: feeId, ruleId: r.id } } })),
    meta: { inlineError: true },
    onSuccess: invalidate,
  });

  function submit() {
    const e = matcherErrors(values);
    setErrors(e ?? {});
    if (!e) add.mutate();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {rules.length === 0 ? (
          <>
            No eligibility rules: <strong>every {payerKind.toLowerCase()}</strong> owes this fee.
          </>
        ) : (
          <>A payer must match at least one rule below to owe this fee.</>
        )}
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
              <TableHead>Final year</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <AnyCell value={r.programCode} />
                </TableCell>
                <TableCell>
                  <DepartmentCell code={r.department} />
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
                <TableCell>
                  <AnyCell value={r.finalYear === null ? null : r.finalYear ? "yes" : "no"} />
                </TableCell>
                <TableCell className="text-right">
                  <GatedButton op="adminDeleteEligibility" size="icon-sm" variant="ghost" aria-label="Delete rule" onClick={() => (del.reset(), setDeleting(r))}>
                    <Trash2 aria-hidden />
                  </GatedButton>
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 align-top hover:bg-muted/40">
              <MatcherInputs
                idPrefix="elig"
                values={values}
                onChange={(p) => setValues((v) => ({ ...v, ...p }))}
                errors={errors}
                disabled={add.isPending}
                wrap={(f, k) => (
                  <TableCell key={k} className="py-1.5">
                    {f}
                  </TableCell>
                )}
              />
              <TableCell className="py-1.5">
                <Select value={finalYear || ANY} onValueChange={(v) => setFinalYear(v === ANY ? "" : (v as "true" | "false"))} disabled={add.isPending}>
                  <SelectTrigger aria-label="Final year" size="sm" className="w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>any</SelectItem>
                    <SelectItem value="true">Final year</SelectItem>
                    <SelectItem value="false">Not final</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="py-1.5 text-right">
                <GatedButton op="adminAddEligibility" size="sm" onClick={submit} disabled={add.isPending}>
                  {add.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
                  Add
                </GatedButton>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {add.error ? <ServerError error={add.error} /> : null}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this eligibility rule?"
        confirmLabel="Delete rule"
        destructive
        onConfirm={() => del.mutateAsync(deleting!)}
      >
        {deleting && (
          <p>
            Payers matching <strong>{describeMatchers(deleting, (c) => departmentLabel(c, departments))}</strong> will no longer be eligible through this rule.
            {rules.length === 1 && " It is the last rule: afterwards every payer of this kind owes the fee."}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
