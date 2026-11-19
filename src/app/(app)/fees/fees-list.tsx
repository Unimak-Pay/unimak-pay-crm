"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { columnsFor, DataTable } from "@/components/data-table";
import { FilterBar, FilterSelect } from "@/components/filters";
import { Day, StatusBadge } from "@/components/format";
import { FormDialog, FormField } from "@/components/form-dialog";
import { MoneyInput, toMinorOrNull, zSleOptional } from "@/components/money-input";
import { GatedButton, RequireOp } from "@/components/permission";
import { PageHeader } from "@/components/states";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { compact, useUrlFilters } from "@/hooks/use-url-filters";
import { formatSleOrDash } from "@/lib/money";

type Fee = components["schemas"]["FeeListItem"];
type FeeStatus = components["schemas"]["FeeStatus"];
const KEYS = ["feeType", "status"] as const;
const STATUSES: FeeStatus[] = ["DRAFT", "ACTIVE", "CLOSED"];

const createSchema = z
  .object({
    feeTypeId: z.string().min(1, "Choose a fee type"),
    name: z.string().trim().min(2, "At least 2 characters").max(100),
    period: z.string().regex(/^[A-Za-z0-9/-]{4,20}$/, "Like 2026/27 or 2026-SEP"),
    allowInstalments: z.boolean(),
    defaultMinInstalment: zSleOptional,
    dueDate: z.string(),
  });
type CreateValues = z.infer<typeof createSchema>;

function CreateFee({ feeTypes }: { feeTypes: components["schemas"]["FeeTypeListItem"][] }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { feeTypeId: "", name: "", period: "", allowInstalments: false, defaultMinInstalment: "", dueDate: "" },
  });
  const m = useMutation({
    mutationFn: (v: CreateValues) =>
      call(
        api.POST("/v1/admin/fees", {
          body: {
            feeTypeId: v.feeTypeId,
            name: v.name,
            period: v.period,
            allowInstalments: v.allowInstalments,
            ...(v.defaultMinInstalment.trim() && { defaultMinInstalment: toMinorOrNull(v.defaultMinInstalment)! }),
            ...(v.dueDate && { dueDate: v.dueDate }),
          },
        }),
      ),
    meta: { inlineError: true },
    onSuccess: (fee) => {
      void qc.invalidateQueries({ queryKey: qk.feesRoot });
      void qc.invalidateQueries({ queryKey: qk.feeTypes });
      setOpen(false);
      router.push(`/fees/${fee.id}`);
    },
  });
  const e = form.formState.errors;
  const allow = useWatch({ control: form.control, name: "allowInstalments" });
  return (
    <>
      <GatedButton op="adminCreateFee" size="sm" onClick={() => (m.reset(), form.reset(), setOpen(true))}>
        <Plus aria-hidden /> New fee
      </GatedButton>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="New fee"
        description="Fees start as DRAFT. Add rate rules, then activate."
        submitLabel="Create draft"
        pending={m.isPending}
        error={m.error}
        onSubmit={form.handleSubmit((v) => m.mutate(v))}
      >
        <FormField label="Fee type" htmlFor="fee-type" error={e.feeTypeId?.message}>
          <Controller
            control={form.control}
            name="feeTypeId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="fee-type" className="w-full">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {feeTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.code} · {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Period" htmlFor="fee-period" error={e.period?.message} hint="2026/27 or an intake like 2026-SEP">
            <Input id="fee-period" className="font-mono" {...form.register("period")} />
          </FormField>
          <FormField label="Due date (optional)" htmlFor="fee-due">
            <Input id="fee-due" type="date" {...form.register("dueDate")} />
          </FormField>
        </div>
        <FormField label="Name" htmlFor="fee-name" error={e.name?.message} hint="e.g. Tuition 2026/27">
          <Input id="fee-name" {...form.register("name")} />
        </FormField>
        <div className="flex items-center gap-2">
          <Controller
            control={form.control}
            name="allowInstalments"
            render={({ field }) => <Switch id="fee-inst" checked={field.value} onCheckedChange={field.onChange} />}
          />
          <label htmlFor="fee-inst" className="text-sm">
            Allow instalments
          </label>
        </div>
        {allow && (
          <FormField label="Default minimum instalment (optional)" htmlFor="fee-min" error={e.defaultMinInstalment?.message} hint="Programs can override it.">
            <MoneyInput id="fee-min" placeholder="1,000.00" {...form.register("defaultMinInstalment")} />
          </FormField>
        )}
      </FormDialog>
    </>
  );
}

const col = columnsFor<Fee>();
const columns = [
  col.accessor("name", { header: "Fee", cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
  col.accessor((f) => f.feeType.code, { id: "type", header: "Type", cell: (c) => <span className="font-mono">{c.getValue()}</span> }),
  col.accessor("period", { header: "Period", cell: (c) => <span className="font-mono">{c.getValue()}</span> }),
  col.accessor("status", { header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor((f) => f._count.rateRules, { id: "rules", header: "Rate rules", meta: { align: "right" } }),
  col.accessor((f) => f._count.obligations, { id: "obligations", header: "Obligations", meta: { align: "right" } }),
  col.accessor("allowInstalments", {
    header: "Instalments",
    cell: (c) => (c.getValue() ? `Yes${c.row.original.defaultMinInstalment ? ` · min ${formatSleOrDash(c.row.original.defaultMinInstalment)}` : ""}` : "No"),
  }),
  col.accessor((f) => f.dueDate ?? "", { id: "due", header: "Due", cell: (c) => <Day day={c.row.original.dueDate} /> }),
];

function Page() {
  const { values, set, reset, active } = useUrlFilters(KEYS);
  const query = compact({ feeType: values.feeType, status: values.status as FeeStatus | "" });
  const fees = useQuery({ queryKey: qk.fees(query), queryFn: () => call(api.GET("/v1/admin/fees", { params: { query } })) });
  const feeTypes = useQuery({ queryKey: qk.feeTypes, queryFn: () => call(api.GET("/v1/admin/fee-types")) });
  return (
    <>
      <PageHeader
        title="Fees"
        description="A fee is a fee type for a period: DRAFT → ACTIVE → CLOSED."
        actions={<CreateFee feeTypes={feeTypes.data ?? []} />}
      />
      <FilterBar onReset={reset} active={active}>
        <FilterSelect
          label="Fee type"
          value={values.feeType}
          onChange={(v) => set({ feeType: v })}
          options={(feeTypes.data ?? []).map((t) => ({ value: t.code, label: `${t.code} · ${t.name}` }))}
        />
        <FilterSelect label="Status" value={values.status} onChange={(v) => set({ status: v })} options={STATUSES} />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={fees.data}
        getRowId={(f) => f.id}
        isLoading={fees.isPending}
        error={fees.error}
        onRetry={() => void fees.refetch()}
        rowHref={(f) => `/fees/${f.id}`}
        emptyTitle={active ? "No fees match these filters" : "No fees yet"}
      />
    </>
  );
}

export function FeesList() {
  return (
    <RequireOp op="adminFees">
      <Page />
    </RequireOp>
  );
}
