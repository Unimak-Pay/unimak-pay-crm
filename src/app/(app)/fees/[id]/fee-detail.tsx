"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Play, RotateCcw, Square } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api, call } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { qk } from "@/api/keys";
import type { components, paths } from "@/api/schema.gen";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyValue, Day, StatusBadge } from "@/components/format";
import { FormDialog, FormField } from "@/components/form-dialog";
import { BackLink, HistoryLink } from "@/components/history-link";
import { MoneyInput, toMajorInput, toMinorOrNull, zSleOptional } from "@/components/money-input";
import { GatedButton, RequireOp } from "@/components/permission";
import { ErrorState, Field, Fields, LoadingBlock, PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { formatSleOrDash } from "@/lib/money";
import { EligibilityRules } from "./eligibility";
import { Instalments } from "./instalments";
import { Preview } from "./preview";
import { RateRules } from "./rate-rules";
import { RepriceButton, RepriceDialog } from "./reprice";

type FeeDetail = components["schemas"]["FeeDetail"];
type FeeStatus = components["schemas"]["FeeStatus"];
type Patch = paths["/v1/admin/fees/{id}"]["patch"]["requestBody"]["content"]["application/json"];

const TAB_KEYS = ["tab"] as const;
const TABS = ["rates", "eligibility", "instalments", "preview"] as const;

const editSchema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(100),
  allowInstalments: z.boolean(),
  defaultMinInstalment: zSleOptional,
  dueDate: z.string(),
});

function useUpdateFee(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Patch) => call(api.PATCH("/v1/admin/fees/{id}", { params: { path: { id } }, body })),
    meta: { inlineError: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.feesRoot });
    },
  });
}

function EditFee({ fee }: { fee: FeeDetail }) {
  const [open, setOpen] = useState(false);
  const m = useUpdateFee(fee.id);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    values: {
      name: fee.name,
      allowInstalments: fee.allowInstalments,
      defaultMinInstalment: toMajorInput(fee.defaultMinInstalment),
      dueDate: fee.dueDate ?? "",
    },
  });
  const e = form.formState.errors;
  return (
    <>
      <GatedButton op="adminUpdateFee" size="sm" variant="outline" onClick={() => (m.reset(), setOpen(true))}>
        <Pencil aria-hidden /> Edit
      </GatedButton>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={`Edit ${fee.name}`}
        submitLabel="Save changes"
        pending={m.isPending}
        error={m.error}
        onSubmit={form.handleSubmit((v) =>
          m.mutate(
            {
              name: v.name,
              allowInstalments: v.allowInstalments,
              defaultMinInstalment: toMinorOrNull(v.defaultMinInstalment),
              dueDate: v.dueDate || null,
            },
            { onSuccess: () => (setOpen(false), toast.success("Fee updated")) },
          ),
        )}
      >
        <FormField label="Name" htmlFor="edit-name" error={e.name?.message}>
          <Input id="edit-name" {...form.register("name")} />
        </FormField>
        <FormField label="Due date" htmlFor="edit-due" hint="Leave empty for no due date.">
          <Input id="edit-due" type="date" {...form.register("dueDate")} />
        </FormField>
        <div className="flex items-center gap-2">
          <Controller control={form.control} name="allowInstalments" render={({ field }) => <Switch id="edit-inst" checked={field.value} onCheckedChange={field.onChange} />} />
          <label htmlFor="edit-inst" className="text-sm">
            Allow instalments
          </label>
        </div>
        <FormField label="Default minimum instalment" htmlFor="edit-min" error={e.defaultMinInstalment?.message} hint="Leave empty to clear it.">
          <MoneyInput id="edit-min" {...form.register("defaultMinInstalment")} />
        </FormField>
      </FormDialog>
    </>
  );
}

function StatusActions({ fee, onRefused }: { fee: FeeDetail; onRefused(msg: string | null): void }) {
  const m = useUpdateFee(fee.id);
  const [confirmClose, setConfirmClose] = useState(false);
  const change = (status: FeeStatus) =>
    m.mutateAsync(
      { status },
      {
        onSuccess: () => {
          onRefused(null);
          toast.success(`Fee is now ${status}`);
        },
      },
    );
  const run = (status: FeeStatus) => change(status).catch((e: unknown) => onRefused(errorMessage(e)));
  return (
    <>
      {fee.status === "DRAFT" && (
        <GatedButton op="adminUpdateFee" size="sm" onClick={() => void run("ACTIVE")} disabled={m.isPending}>
          {m.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
          Activate
        </GatedButton>
      )}
      {fee.status === "ACTIVE" && (
        <GatedButton op="adminUpdateFee" size="sm" variant="outline" onClick={() => setConfirmClose(true)} disabled={m.isPending}>
          <Square aria-hidden /> Close fee
        </GatedButton>
      )}
      {fee.status === "CLOSED" && (
        <GatedButton op="adminUpdateFee" size="sm" variant="outline" onClick={() => void run("ACTIVE")} disabled={m.isPending}>
          {m.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
          Reopen
        </GatedButton>
      )}
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={`Close ${fee.name}?`}
        confirmLabel="Close fee"
        destructive
        onConfirm={() => change("CLOSED")}
      >
        <p>
          <strong>{fee.name}</strong> ({fee.period}) stops creating new obligations. Existing obligations ({fee._count.obligations}) and payments
          already in progress are not affected. You can reopen it later.
        </p>
      </ConfirmDialog>
    </>
  );
}

function Detail({ id }: { id: string }) {
  const q = useQuery({ queryKey: qk.fee(id), queryFn: () => call(api.GET("/v1/admin/fees/{id}", { params: { path: { id } } })) });
  const { values, set } = useUrlFilters(TAB_KEYS);
  const tab = (TABS as readonly string[]).includes(values.tab) ? values.tab : "rates";
  const [refused, setRefused] = useState<string | null>(null);
  // set after a rate rule is saved or deleted: existing obligations still have the old price
  const [rulesChanged, setRulesChanged] = useState(false);
  const [repricing, setRepricing] = useState(false);

  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const fee = q.data;
  const ft = fee.feeType;

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <BackLink href="/fees">Fees</BackLink>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {fee.name} <StatusBadge status={fee.status} />
            </span>
          }
          description={`${ft.code} · ${ft.name} · ${fee.period}`}
          actions={
            <>
              <HistoryLink entity="Fee" entityId={fee.id} />
              <EditFee fee={fee} />
              <StatusActions fee={fee} onRefused={setRefused} />
            </>
          }
        />
      </div>
      {refused && (
        <Alert variant="destructive">
          <AlertTitle>The status was not changed</AlertTitle>
          <AlertDescription>{refused}</AlertDescription>
        </Alert>
      )}
      {fee.status === "DRAFT" && !refused && (fee.rateRules.length === 0 || !ft.account) && (
        <Alert>
          <AlertTitle>Before you can activate</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {fee.rateRules.length === 0 && <li>Add at least one rate rule.</li>}
              {!ft.account && <li>Create the {ft.code} fee type&apos;s Monime account on the Fee types page.</li>}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="pt-4">
          <Fields>
            <Field label="Payer">{ft.payerKind === "STUDENT" ? "Students" : "Applicants"}</Field>
            <Field label="Due date">
              <Day day={fee.dueDate} />
            </Field>
            <Field label="Instalments">
              {fee.allowInstalments ? `Allowed · default minimum ${formatSleOrDash(fee.defaultMinInstalment)}` : "Not allowed"}
            </Field>
            <Field label="Obligations">{fee._count.obligations}</Field>
            <Field label="Collects into">{ft.account ? <CopyValue value={ft.account.reference} /> : <span className="text-destructive">No Monime account yet</span>}</Field>
            <Field label="Fee id">
              <CopyValue value={fee.id} truncate />
            </Field>
          </Fields>
        </CardContent>
      </Card>
      <Tabs value={tab} onValueChange={(v) => set({ tab: v === "rates" ? "" : v })}>
        <TabsList>
          <TabsTrigger value="rates">Rate rules ({fee.rateRules.length})</TabsTrigger>
          <TabsTrigger value="eligibility">Eligibility ({fee.eligibilityRules.length})</TabsTrigger>
          <TabsTrigger value="instalments">Instalments ({fee.instalmentRules.length})</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="rates" className="space-y-3 pt-2">
          {rulesChanged && fee.status !== "DRAFT" && (
            <Alert data-testid="reprice-suggestion">
              <AlertTitle>Rate rules changed</AlertTitle>
              <AlertDescription>
                <p>New obligations use the new rules. The {fee._count.obligations} existing obligations keep the price they were created with until you re-price them.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <RepriceButton variant="default" onClick={() => setRepricing(true)} />
                  <Button size="sm" variant="ghost" onClick={() => setRulesChanged(false)}>
                    Not now
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          <RateRules feeId={fee.id} rules={fee.rateRules} onChanged={() => setRulesChanged(true)} />
          {!rulesChanged && fee.status !== "DRAFT" && <RepriceButton onClick={() => setRepricing(true)} />}
          <RepriceDialog feeId={fee.id} feeName={fee.name} open={repricing} onOpenChange={setRepricing} onApplied={() => setRulesChanged(false)} />
        </TabsContent>
        <TabsContent value="eligibility" className="pt-2">
          <EligibilityRules feeId={fee.id} rules={fee.eligibilityRules} payerKind={ft.payerKind} />
        </TabsContent>
        <TabsContent value="instalments" className="pt-2">
          <Instalments fee={fee} />
        </TabsContent>
        <TabsContent value="preview" className="pt-2">
          <Preview feeId={fee.id} defaultKind={ft.payerKind === "APPLICANT" ? "applicant" : "student"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function FeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireOp op="adminFee">
      <Detail id={id} />
    </RequireOp>
  );
}
