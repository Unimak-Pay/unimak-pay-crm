"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Save, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSle, formatSleOrDash, parseSleInput } from "@/lib/money";
import { groupInstalmentRules, LEVELS, levelLabel } from "./instalment-order";

type Rule = components["schemas"]["InstalmentRule"];

const ALL = "all";
/** `?level=` for a rule: none for the all-levels rule. */
const levelQuery = (level: number | null) => (level === null ? {} : { level });

export function Instalments({ fee }: { fee: components["schemas"]["FeeDetail"] }) {
  const qc = useQueryClient();
  const { departments } = useAcademics();
  const nameOf = (code: string) => departmentLabel(code, departments);
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const invalidate = () => void qc.invalidateQueries({ queryKey: qk.fee(fee.id) });

  const set = useMutation({
    mutationFn: (v: { department: string; level: number | null; minInstalment: string }) =>
      call(
        api.PUT("/v1/admin/fees/{id}/instalment-rules/{department}", {
          params: { path: { id: fee.id, department: v.department }, query: levelQuery(v.level) },
          body: { minInstalment: v.minInstalment },
        }),
      ),
    meta: { inlineError: true },
    onSuccess: () => {
      invalidate();
      setDepartment("");
      setLevel(null);
      setAmount("");
    },
  });
  const del = useMutation({
    mutationFn: (r: Rule) =>
      call(
        api.DELETE("/v1/admin/fees/{id}/instalment-rules/{department}", {
          params: { path: { id: fee.id, department: r.department }, query: levelQuery(r.level) },
        }),
      ),
    meta: { inlineError: true },
    onSuccess: invalidate,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!department) return setError("Choose a department");
    const a = parseSleInput(amount);
    if (!a.ok) return setError(a.error);
    setError(null);
    set.mutate({ department, level, minInstalment: a.minor });
  }

  const groups = groupInstalmentRules(fee.instalmentRules, nameOf);
  const allLevelsRule = deleting && deleting.level !== null ? fee.instalmentRules.find((r) => r.department === deleting.department && r.level === null) : undefined;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {fee.allowInstalments ? (
          <>
            Instalments are allowed. Fee default minimum: <strong>{formatSleOrDash(fee.defaultMinInstalment)}</strong>
            {fee.defaultMinInstalment ? "" : " (none: any amount)"}. A department minimum below overrides the default for that department&apos;s payers.
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
              <TableHead>Level</TableHead>
              <TableHead className="text-right">Minimum instalment</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  No department minimums: every department uses the fee default.
                </TableCell>
              </TableRow>
            )}
            {groups.map((g) => (
              <Fragment key={g.department}>
                {g.rules.map((r, i) => {
                  const what = `${nameOf(r.department)}, ${levelLabel(r.level).toLowerCase()}`;
                  return (
                    <TableRow key={r.id} data-testid="instalment-rule" className={i === 0 ? "border-t-2" : undefined}>
                      <TableCell>
                        {/* the name once per department; still in each row for screen readers */}
                        {i === 0 ? <DepartmentName code={r.department} /> : <span className="sr-only">{nameOf(r.department)}</span>}
                      </TableCell>
                      <TableCell className={r.level === null ? "text-muted-foreground" : undefined}>{levelLabel(r.level)}</TableCell>
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
                          aria-label={`Change ${what}`}
                          onClick={() => {
                            setDepartment(r.department);
                            setLevel(r.level);
                            setAmount(toMajorInput(r.minInstalment));
                          }}
                        >
                          <Pencil aria-hidden />
                        </GatedButton>
                        <GatedButton op="adminDeleteInstalment" size="icon-sm" variant="ghost" aria-label={`Remove ${what}`} onClick={() => (del.reset(), setDeleting(r))}>
                          <Trash2 aria-hidden />
                        </GatedButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
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
          <Label htmlFor="inst-level" className="text-xs">
            Level
          </Label>
          <Select value={level === null ? ALL : String(level)} onValueChange={(v) => setLevel(v === ALL ? null : Number(v))}>
            <SelectTrigger id="inst-level" size="sm" className="w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All levels</SelectItem>
              {LEVELS.map((l) => (
                <SelectItem key={l} value={String(l)}>
                  {levelLabel(l)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      <p className="text-xs text-muted-foreground">A level rule wins over the all-levels rule. Applicants only get the all-levels rule.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {set.error ? <ServerError error={set.error} /> : null}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Remove the ${nameOf(deleting.department)} ${levelLabel(deleting.level).toLowerCase()} minimum?` : ""}
        confirmLabel="Remove"
        destructive
        onConfirm={() => del.mutateAsync(deleting!)}
      >
        {deleting &&
          (deleting.level === null ? (
            <p>
              {nameOf(deleting.department)} applicants, and students without a level rule, will use the fee default ({formatSleOrDash(fee.defaultMinInstalment)}) instead of{" "}
              {formatSle(deleting.minInstalment)}.
            </p>
          ) : (
            <p>
              {nameOf(deleting.department)} level {deleting.level} students will use{" "}
              {allLevelsRule
                ? `the all-levels minimum (${formatSle(allLevelsRule.minInstalment)})`
                : `the fee default (${formatSleOrDash(fee.defaultMinInstalment)})`}{" "}
              instead of {formatSle(deleting.minInstalment)}.
            </p>
          ))}
      </ConfirmDialog>
    </div>
  );
}
