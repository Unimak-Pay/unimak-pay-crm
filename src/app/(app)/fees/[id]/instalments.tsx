"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { DepartmentName, DepartmentSelect, departmentLabel, useAcademics } from "@/components/academics";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateTime, Money } from "@/components/format";
import { ServerError } from "@/components/form-dialog";
import { MoneyInput, toMajorInput } from "@/components/money-input";
import { GatedButton } from "@/components/permission";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSle, formatSleOrDash, parseSleInput } from "@/lib/money";

type Rule = components["schemas"]["InstalmentRule"];

export function Instalments({ fee }: { fee: components["schemas"]["FeeDetail"] }) {
  const qc = useQueryClient();
  const { departments } = useAcademics();
  const [department, setDepartment] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const invalidate = () => void qc.invalidateQueries({ queryKey: qk.fee(fee.id) });

  const set = useMutation({
    mutationFn: (v: { department: string; minInstalment: string }) =>
      call(
        api.PUT("/v1/admin/fees/{id}/instalment-rules/{department}", {
          params: { path: { id: fee.id, department: v.department } },
          body: { minInstalment: v.minInstalment },
        }),
      ),
    meta: { inlineError: true },
    onSuccess: () => {
      invalidate();
      setDepartment("");
      setAmount("");
    },
  });
  const del = useMutation({
    mutationFn: (r: Rule) =>
      call(api.DELETE("/v1/admin/fees/{id}/instalment-rules/{department}", { params: { path: { id: fee.id, department: r.department } } })),
    meta: { inlineError: true },
    onSuccess: invalidate,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!department) return setError("Choose a department");
    const a = parseSleInput(amount);
    if (!a.ok) return setError(a.error);
    setError(null);
    set.mutate({ department, minInstalment: a.minor });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {fee.allowInstalments ? (
          <>
            Instalments are allowed. Fee default minimum: <strong>{formatSleOrDash(fee.defaultMinInstalment)}</strong>
            {fee.defaultMinInstalment ? "" : " (none: any amount)"}. A department minimum below overrides the default for that department&apos;s students and applicants.
          </>
        ) : (
          <>Instalments are off for this fee (edit the fee to allow them). Department minimums only apply while they are allowed.</>
        )}
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Minimum instalment</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fee.instalmentRules.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                  No department minimums: every department uses the fee default.
                </TableCell>
              </TableRow>
            )}
            {fee.instalmentRules.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <DepartmentName code={r.department} />
                </TableCell>
                <TableCell className="text-right">
                  <Money minor={r.minInstalment} />
                </TableCell>
                <TableCell>
                  <DateTime iso={r.updatedAt} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <GatedButton
                    op="adminSetInstalment"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Change ${departmentLabel(r.department, departments)}`}
                    onClick={() => {
                      setDepartment(r.department);
                      setAmount(toMajorInput(r.minInstalment));
                    }}
                  >
                    <Pencil aria-hidden />
                  </GatedButton>
                  <GatedButton op="adminDeleteInstalment" size="icon-sm" variant="ghost" aria-label={`Remove ${departmentLabel(r.department, departments)}`} onClick={() => (del.reset(), setDeleting(r))}>
                    <Trash2 aria-hidden />
                  </GatedButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2" noValidate>
        <div className="space-y-1">
          <Label htmlFor="inst-department" className="text-xs">
            Department
          </Label>
          <DepartmentSelect id="inst-department" value={department} onChange={setDepartment} className="w-56" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="inst-amount" className="text-xs">
            Minimum instalment
          </Label>
          <MoneyInput id="inst-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1,000.00" className="h-8 w-44" />
        </div>
        <GatedButton op="adminSetInstalment" size="sm" type="submit" disabled={set.isPending}>
          {set.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          Set minimum
        </GatedButton>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {set.error ? <ServerError error={set.error} /> : null}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Remove the ${deleting ? departmentLabel(deleting.department, departments) : ""} minimum?`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => del.mutateAsync(deleting!)}
      >
        {deleting && (
          <p>
            {departmentLabel(deleting.department, departments)} students and applicants will use the fee default ({formatSleOrDash(fee.defaultMinInstalment)}) instead of{" "}
            {formatSle(deleting.minInstalment)}.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
