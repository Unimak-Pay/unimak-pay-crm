"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, WalletCards } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api, call } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { columnsFor, DataTable } from "@/components/data-table";
import { CopyValue } from "@/components/format";
import { FormDialog, FormField } from "@/components/form-dialog";
import { GatedButton, RequireOp } from "@/components/permission";
import { PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FeeType = components["schemas"]["FeeTypeListItem"];

const createSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,19}$/, "2–20 characters: capital letters, digits or _, starting with a letter"),
  name: z.string().trim().min(2, "At least 2 characters").max(100),
  payerKind: z.enum(["APPLICANT", "STUDENT"]),
  recurrence: z.enum(["ONCE", "PER_YEAR"]),
});

function CreateFeeType({ onCreated }: { onCreated(r: { code: string; accountError: string | null | undefined }): void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { code: "", name: "", payerKind: "STUDENT", recurrence: "PER_YEAR" },
  });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof createSchema>) => call(api.POST("/v1/admin/fee-types", { body: v })),
    meta: { inlineError: true },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: qk.feeTypes });
      void qc.invalidateQueries({ queryKey: qk.accounts });
      setOpen(false);
      form.reset();
      onCreated({ code: r.code, accountError: r.accountError });
      if (!r.accountError) toast.success(`Fee type ${r.code} created with its Monime account`);
    },
  });
  const e = form.formState.errors;
  return (
    <>
      <GatedButton op="adminCreateFeeType" size="sm" onClick={() => (m.reset(), setOpen(true))}>
        <Plus aria-hidden /> New fee type
      </GatedButton>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="New fee type"
        description="Creates the fee type and its own Monime financial account (unimak-fee-<code>)."
        submitLabel="Create fee type"
        pending={m.isPending}
        error={m.error}
        onSubmit={form.handleSubmit((v) => m.mutate(v))}
      >
        <FormField label="Code" htmlFor="ft-code" error={e.code?.message} hint="e.g. LIB. Cannot be changed later.">
          <Input
            id="ft-code"
            className="font-mono uppercase"
            {...form.register("code", { setValueAs: (v: string) => v.trim().toUpperCase() })}
          />
        </FormField>
        <FormField label="Name" htmlFor="ft-name" error={e.name?.message}>
          <Input id="ft-name" {...form.register("name")} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Payer" htmlFor="ft-kind">
            <Controller
              control={form.control}
              name="payerKind"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ft-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STUDENT">Students</SelectItem>
                    <SelectItem value="APPLICANT">Applicants</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField label="Recurrence" htmlFor="ft-rec">
            <Controller
              control={form.control}
              name="recurrence"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ft-rec" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PER_YEAR">Every academic year</SelectItem>
                    <SelectItem value="ONCE">Once</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        </div>
      </FormDialog>
    </>
  );
}

function RenameFeeType({ ft }: { ft: FeeType }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const schema = createSchema.pick({ name: true });
  const form = useForm<{ name: string }>({ resolver: zodResolver(schema), values: { name: ft.name } });
  const m = useMutation({
    mutationFn: (name: string) => call(api.PATCH("/v1/admin/fee-types/{id}", { params: { path: { id: ft.id } }, body: { name } })),
    meta: { inlineError: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.feeTypes });
      void qc.invalidateQueries({ queryKey: qk.feesRoot });
      setOpen(false);
      toast.success("Fee type renamed");
    },
  });
  return (
    <>
      <GatedButton op="adminRenameFeeType" size="icon-sm" variant="ghost" aria-label={`Rename ${ft.code}`} onClick={() => (m.reset(), setOpen(true))}>
        <Pencil aria-hidden />
      </GatedButton>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={`Rename ${ft.code}`}
        submitLabel="Save"
        pending={m.isPending}
        error={m.error}
        onSubmit={form.handleSubmit((v) => m.mutate(v.name))}
      >
        <FormField label="Name" htmlFor="ft-rename" error={form.formState.errors.name?.message}>
          <Input id="ft-rename" {...form.register("name")} />
        </FormField>
      </FormDialog>
    </>
  );
}

function CreateAccountButton({ ft }: { ft: FeeType }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => call(api.POST("/v1/admin/fee-types/{id}/account", { params: { path: { id: ft.id } } })),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: qk.feeTypes });
      void qc.invalidateQueries({ queryKey: qk.accounts });
      toast.success(r.created ? `Account ${r.reference} created at Monime` : `Account ${r.reference} already existed and is linked`);
    },
  });
  return (
    <GatedButton op="adminFeeTypeAccount" size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
      {m.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <WalletCards aria-hidden />}
      Create account
    </GatedButton>
  );
}

const col = columnsFor<FeeType>();
const columns = [
  col.accessor("code", { header: "Code", cell: (c) => <span className="font-mono font-medium">{c.getValue()}</span> }),
  col.accessor("name", { header: "Name" }),
  col.accessor("payerKind", { header: "Payer", cell: (c) => (c.getValue() === "STUDENT" ? "Students" : "Applicants") }),
  col.accessor("recurrence", { header: "Recurs", cell: (c) => (c.getValue() === "PER_YEAR" ? "Every year" : "Once") }),
  col.accessor((t) => t._count.fees, { id: "fees", header: "Fees", meta: { align: "right" } }),
  col.accessor((t) => t.account?.reference ?? "", {
    id: "account",
    header: "Monime account",
    cell: (c) => {
      const a = c.row.original.account;
      if (!a) return <CreateAccountButton ft={c.row.original} />;
      return (
        <div className="space-y-0.5">
          <CopyValue value={a.reference} />
          <div className="text-[11px] text-muted-foreground">
            <CopyValue value={a.monimeId} />
          </div>
        </div>
      );
    },
  }),
  col.accessor((t) => t.account?.uvan ?? "", { id: "uvan", header: "UVAN", cell: (c) => <CopyValue value={c.row.original.account?.uvan} /> }),
  col.display({ id: "actions", header: "", cell: (c) => <RenameFeeType ft={c.row.original} /> }),
];

function Page() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.feeTypes, queryFn: () => call(api.GET("/v1/admin/fee-types")) });
  const [created, setCreated] = useState<{ code: string; accountError: string | null | undefined } | null>(null);
  const failedType = created?.accountError ? q.data?.find((t) => t.code === created.code) : undefined;
  const retry = useMutation({
    mutationFn: (id: string) => call(api.POST("/v1/admin/fee-types/{id}/account", { params: { path: { id } } })),
    meta: { inlineError: true },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: qk.feeTypes });
      void qc.invalidateQueries({ queryKey: qk.accounts });
      setCreated(null);
      toast.success(`Account ${r.reference} created at Monime`);
    },
  });
  return (
    <>
      <PageHeader
        title="Fee types"
        description="Each fee type collects into its own Monime financial account."
        actions={<CreateFeeType onCreated={setCreated} />}
      />
      {created?.accountError && (
        <Alert variant="destructive" className="mb-3">
          <AlertTitle>{created.code} was saved, but its Monime account was not created</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{created.accountError}</p>
            {retry.error ? <p>{errorMessage(retry.error)}</p> : null}
            {failedType && (
              <GatedButton op="adminFeeTypeAccount" size="sm" variant="outline" onClick={() => retry.mutate(failedType.id)} disabled={retry.isPending}>
                {retry.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Create account
              </GatedButton>
            )}
          </AlertDescription>
        </Alert>
      )}
      <DataTable
        columns={columns}
        rows={q.data}
        getRowId={(t) => t.id}
        isLoading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        emptyTitle="No fee types yet"
      />
    </>
  );
}

export function FeeTypes() {
  return (
    <RequireOp op="adminFeeTypes">
      <Page />
    </RequireOp>
  );
}
