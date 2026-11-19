"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateTime, Money } from "@/components/format";
import { ServerError } from "@/components/form-dialog";
import { MoneyInput, toMajorInput } from "@/components/money-input";
import { GatedButton } from "@/components/permission";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSle, formatSleOrDash, parseSleInput } from "@/lib/money";

type Rule = components["schemas"]["InstalmentRule"];

export function Instalments({ fee }: { fee: components["schemas"]["FeeDetail"] }) {
  const qc = useQueryClient();
  const [program, setProgram] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const invalidate = () => void qc.invalidateQueries({ queryKey: qk.fee(fee.id) });

  const set = useMutation({
    mutationFn: (v: { programCode: string; minInstalment: string }) =>
      call(
        api.PUT("/v1/admin/fees/{id}/instalment-rules/{programCode}", {
          params: { path: { id: fee.id, programCode: v.programCode } },
          body: { minInstalment: v.minInstalment },
        }),
      ),
    meta: { inlineError: true },
    onSuccess: () => {
      invalidate();
      setProgram("");
      setAmount("");
    },
  });
  const del = useMutation({
    mutationFn: (r: Rule) =>
      call(api.DELETE("/v1/admin/fees/{id}/instalment-rules/{programCode}", { params: { path: { id: fee.id, programCode: r.programCode } } })),
    meta: { inlineError: true },
    onSuccess: invalidate,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const code = program.trim().toUpperCase();
    if (!/^[A-Z0-9-]{2,20}$/.test(code)) return setError("Enter a program code like BSC-CS");
    const a = parseSleInput(amount);
    if (!a.ok) return setError(a.error);
    setError(null);
    set.mutate({ programCode: code, minInstalment: a.minor });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {fee.allowInstalments ? (
          <>
            Instalments are allowed. Fee default minimum: <strong>{formatSleOrDash(fee.defaultMinInstalment)}</strong>
            {fee.defaultMinInstalment ? "" : " (none: any amount)"}. A program rule below overrides the default.
          </>
        ) : (
          <>Instalments are off for this fee (edit the fee to allow them). Program rules only apply while they are allowed.</>
        )}
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow>
              <TableHead>Program</TableHead>
              <TableHead className="text-right">Minimum instalment</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fee.instalmentRules.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                  No program rules: every program uses the fee default.
                </TableCell>
              </TableRow>
            )}
            {fee.instalmentRules.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.programCode}</TableCell>
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
                    aria-label={`Change ${r.programCode}`}
                    onClick={() => {
                      setProgram(r.programCode);
                      setAmount(toMajorInput(r.minInstalment));
                    }}
                  >
                    <Pencil aria-hidden />
                  </GatedButton>
                  <GatedButton op="adminDeleteInstalment" size="icon-sm" variant="ghost" aria-label={`Remove ${r.programCode}`} onClick={() => (del.reset(), setDeleting(r))}>
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
          <Label htmlFor="inst-program" className="text-xs">
            Program code
          </Label>
          <Input id="inst-program" value={program} onChange={(e) => setProgram(e.target.value)} placeholder="BSC-CS" className="h-8 w-36 font-mono uppercase" />
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
        title={`Remove the ${deleting?.programCode} minimum?`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => del.mutateAsync(deleting!)}
      >
        {deleting && (
          <p>
            {deleting.programCode} students will use the fee default ({formatSleOrDash(fee.defaultMinInstalment)}) instead of{" "}
            {formatSle(deleting.minInstalment)}.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
