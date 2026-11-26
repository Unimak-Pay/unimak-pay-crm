"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { useState } from "react";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { useMe } from "@/auth/auth-provider";
import { CheckList } from "@/components/academics";
import { DateTime } from "@/components/format";
import { FormField, ServerError } from "@/components/form-dialog";
import { GatedButton, RequireOp, useCanOp } from "@/components/permission";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Policy = components["schemas"]["ClearancePolicy"];
type Draft = { examName: string; period: string; feeTypeCodes: string[]; includeOverdue: boolean };

/** Who last set the rule: `admin:<id>` (a name when the users list is readable), or the initial setup. */
function useUpdatedBy(updatedBy: string): string {
  const me = useMe();
  const canOp = useCanOp();
  const users = useQuery({ queryKey: qk.users, queryFn: () => call(api.GET("/v1/admin/users")), enabled: canOp("adminListUsers"), staleTime: 60_000 });
  if (updatedBy.startsWith("system")) return "the initial setup";
  const id = updatedBy.replace(/^admin:/, "");
  if (id === me.id) return "you";
  const u = users.data?.find((x) => x.id === id);
  return u ? (u.name ?? u.email) : updatedBy;
}

type Save = ReturnType<typeof useSave>;

function useSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Draft) => call(api.PUT("/v1/admin/clearance-policy", { body })),
    meta: { inlineError: true },
    onSuccess: (p) => {
      qc.setQueryData(qk.clearancePolicy, p);
      void qc.invalidateQueries({ queryKey: qk.auditRoot });
    },
  });
}

function Form({ policy, save }: { policy: Policy; save: Save }) {
  const canOp = useCanOp();
  const canEdit = canOp("adminPutClearancePolicy");
  const by = useUpdatedBy(policy.updatedBy);
  const [d, setD] = useState<Draft>({ examName: policy.examName, period: policy.period, feeTypeCodes: policy.feeTypeCodes, includeOverdue: policy.includeOverdue });
  const [local, setLocal] = useState<string | null>(null);
  const feeTypes = useQuery({ queryKey: qk.feeTypes, queryFn: () => call(api.GET("/v1/admin/fee-types")) });

  // fee types the rule lists but the catalogue no longer has stay visible, so they can be unticked
  const known = feeTypes.data ?? [];
  const items = [
    ...known.map((t) => ({ value: t.code, label: `${t.code} · ${t.name}` })),
    ...d.feeTypeCodes.filter((c) => !known.some((t) => t.code === c)).map((c) => ({ value: c, label: `${c} (not a fee type)` })),
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.examName.trim()) return setLocal("Give the exam a name");
    if (!d.period.trim()) return setLocal("Give the period, e.g. 2026/27");
    setLocal(null);
    save.mutate({ ...d, examName: d.examName.trim(), period: d.period.trim() });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Exam clearance rule">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Exam" htmlFor="cl-exam" hint="As students see it on their pass">
          <Input id="cl-exam" value={d.examName} maxLength={80} disabled={!canEdit} onChange={(e) => setD({ ...d, examName: e.target.value })} />
        </FormField>
        <FormField label="Period" htmlFor="cl-period" hint="The fees of this period count, e.g. 2026/27">
          <Input id="cl-period" value={d.period} maxLength={20} disabled={!canEdit} onChange={(e) => setD({ ...d, period: e.target.value })} />
        </FormField>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm">Fee types that must be fully paid</Label>
        {canEdit ? (
          <CheckList legend="Fee types that must be fully paid" groups={[{ label: null, items }]} value={d.feeTypeCodes} onChange={(v) => setD({ ...d, feeTypeCodes: v })} />
        ) : (
          <p className="text-sm">{d.feeTypeCodes.length ? d.feeTypeCodes.join(", ") : "None"}</p>
        )}
      </div>
      <div className="flex items-start gap-2">
        <Checkbox id="cl-overdue" checked={d.includeOverdue} disabled={!canEdit} onCheckedChange={(c) => setD({ ...d, includeOverdue: c === true })} />
        <div>
          <Label htmlFor="cl-overdue" className="text-sm font-normal">
            Fees past their due date must also be paid
          </Label>
          <p className="text-xs text-muted-foreground">Any fee, from any period, whose due date has passed.</p>
        </div>
      </div>
      {local && <p className="text-sm text-destructive">{local}</p>}
      {save.error ? <ServerError error={save.error} /> : null}
      {save.isSuccess && !save.isPending && <p className="text-sm text-emerald-700 dark:text-emerald-400">Saved. Passes already issued re-check against this rule.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" data-testid="clearance-updated">
          Last changed by {by} at <DateTime iso={policy.updatedAt} />
        </p>
        <GatedButton op="adminPutClearancePolicy" type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          Save rule
        </GatedButton>
      </div>
    </form>
  );
}

function Page() {
  const q = useQuery({ queryKey: qk.clearancePolicy, queryFn: () => call(api.GET("/v1/admin/clearance-policy")) });
  const save = useSave();
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title="Exam clearance"
        description="Who gets an exam pass in the Dash app: a student is cleared when every listed fee of the period, and (if ticked) every overdue fee, is fully paid. Passes are checked live, so changes apply at once."
      />
      {q.isPending ? (
        <LoadingBlock rows={4} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          {q.data.placeholder && (
            <Alert data-testid="clearance-placeholder" className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertTriangle aria-hidden />
              <AlertTitle>This is a placeholder rule, not the university&apos;s.</AlertTitle>
              <AlertDescription className="text-current">Set the real rule before students use exam passes.</AlertDescription>
            </Alert>
          )}
          <Card>
            <CardContent className="pt-4">
              {/* keyed on the saved version so a save (or someone else's) resets the form to what the server holds */}
              <Form key={q.data.updatedAt} policy={q.data} save={save} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export function ClearancePolicyPage() {
  return (
    <RequireOp op="adminGetClearancePolicy">
      <Page />
    </RequireOp>
  );
}
