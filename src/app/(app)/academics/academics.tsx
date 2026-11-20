"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api, call } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { type Department, type Faculty, FacultySelect, useFaculties, useNeedsReview } from "@/components/academics";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateTime } from "@/components/format";
import { FormDialog, FormField } from "@/components/form-dialog";
import { GatedButton } from "@/components/permission";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type ListedDepartment = components["schemas"]["DepartmentListItem"];

/** Same rule as the backend's AcademicCode. */
const CODE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;
const CODE_HINT = "Must match the portal's code exactly (case matters). It can't be changed later.";

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.academicsRoot });
    // payer names on payments and reports come from these
    void qc.invalidateQueries({ queryKey: qk.paymentsRoot });
    void qc.invalidateQueries({ queryKey: ["reports"] });
  };
}

function InactiveBadge() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Inactive
    </Badge>
  );
}

// ── faculty dialog ──

const facultySchema = z.object({
  code: z.string().trim().regex(CODE, "1–40 letters, digits, - _ or ., starting with a letter or digit"),
  name: z.string().trim().min(1, "Enter a name").max(120),
});

function FacultyDialog({ faculty, open, onOpenChange }: { faculty?: Faculty; open: boolean; onOpenChange(o: boolean): void }) {
  const invalidate = useInvalidate();
  const form = useForm({ resolver: zodResolver(facultySchema), values: { code: faculty?.code ?? "", name: faculty?.name ?? "" } });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof facultySchema>) =>
      faculty
        ? call(api.PATCH("/v1/admin/faculties/{code}", { params: { path: { code: faculty.code } }, body: { name: v.name } }))
        : call(api.POST("/v1/admin/faculties", { body: { code: v.code, name: v.name } })),
    meta: { inlineError: true },
    onSuccess: (f) => {
      invalidate();
      onOpenChange(false);
      toast.success(faculty ? `${f.name} saved` : `${f.name} added`);
    },
  });
  const e = form.formState.errors;
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => (m.reset(), onOpenChange(o))}
      title={faculty ? `Rename ${faculty.name}` : "Add a faculty"}
      submitLabel={faculty ? "Save" : "Add faculty"}
      pending={m.isPending}
      error={m.error}
      onSubmit={form.handleSubmit((v) => m.mutate(v))}
    >
      <FormField label="Code" htmlFor="f-code" error={e.code?.message} hint={faculty ? "Codes never change." : CODE_HINT}>
        <Input id="f-code" className="font-mono" disabled={!!faculty} placeholder="FAC-SCI-TECH" {...form.register("code")} />
      </FormField>
      <FormField label="Name" htmlFor="f-name" error={e.name?.message}>
        <Input id="f-name" placeholder="Faculty of Science & Technology" {...form.register("name")} />
      </FormField>
    </FormDialog>
  );
}

// ── department dialog ──

const departmentSchema = z.object({
  code: z.string().trim().regex(CODE, "1–40 letters, digits, - _ or ., starting with a letter or digit"),
  name: z.string().trim().min(1, "Enter a name").max(120),
  facultyCode: z.string().min(1, "Choose a faculty"),
});

/**
 * Add, edit, or set up a department the portal sent (`needsReview`): giving it a name and a
 * faculty marks it reviewed.
 */
function DepartmentDialog({
  department,
  open,
  onOpenChange,
  defaultFaculty,
}: {
  department?: Pick<ListedDepartment, "code" | "name" | "needsReview"> & { facultyCode: string | null };
  open: boolean;
  onOpenChange(o: boolean): void;
  defaultFaculty?: string;
}) {
  const invalidate = useInvalidate();
  const review = department?.needsReview ?? false;
  const form = useForm({
    resolver: zodResolver(departmentSchema),
    values: {
      code: department?.code ?? "",
      // a department needing review is named after its code: make the admin type the real name
      name: review ? "" : (department?.name ?? ""),
      facultyCode: department?.facultyCode ?? defaultFaculty ?? "",
    },
  });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof departmentSchema>) =>
      department
        ? call(api.PATCH("/v1/admin/departments/{code}", { params: { path: { code: department.code } }, body: { name: v.name, facultyCode: v.facultyCode } }))
        : call(api.POST("/v1/admin/departments", { body: v })),
    meta: { inlineError: true },
    onSuccess: (d) => {
      invalidate();
      onOpenChange(false);
      toast.success(review ? `${d.name} is set up and can be used in rules` : department ? `${d.name} saved` : `${d.name} added`);
    },
  });
  const e = form.formState.errors;
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => (m.reset(), onOpenChange(o))}
      title={review ? `Set up ${department!.code}` : department ? `Edit ${department.name}` : "Add a department"}
      description={
        review
          ? "The portal sent this department code for a payer. Give it a name and a faculty so it can be used in rules and reports."
          : undefined
      }
      submitLabel={review ? "Mark reviewed" : department ? "Save" : "Add department"}
      pending={m.isPending}
      error={m.error}
      onSubmit={form.handleSubmit((v) => m.mutate(v))}
    >
      <FormField label="Code" htmlFor="d-code" error={e.code?.message} hint={department ? "Codes never change: it's what the portal sends." : CODE_HINT}>
        <Input id="d-code" className="font-mono" disabled={!!department} placeholder="COMPUTING" {...form.register("code")} />
      </FormField>
      <FormField label="Name" htmlFor="d-name" error={e.name?.message}>
        <Input id="d-name" placeholder="Computer Science" {...form.register("name")} />
      </FormField>
      <FormField label="Faculty" htmlFor="d-faculty" error={e.facultyCode?.message} hint={department && !review ? "Moving it changes which dean sees its payments." : undefined}>
        <Controller
          control={form.control}
          name="facultyCode"
          render={({ field }) => <FacultySelect id="d-faculty" size="default" className="w-full" value={field.value} onChange={field.onChange} />}
        />
      </FormField>
    </FormDialog>
  );
}

// ── activate / deactivate ──

function ActiveButton({ kind, code, name, active }: { kind: "faculty" | "department"; code: string; name: string; active: boolean }) {
  const invalidate = useInvalidate();
  const [confirm, setConfirm] = useState(false);
  const m = useMutation({
    mutationFn: (next: boolean) =>
      kind === "faculty"
        ? call(api.PATCH("/v1/admin/faculties/{code}", { params: { path: { code } }, body: { active: next } }))
        : call(api.PATCH("/v1/admin/departments/{code}", { params: { path: { code } }, body: { active: next } })),
    // reactivation errors go to the global toast; deactivation shows them in the dialog
    meta: { inlineError: true },
    onSuccess: (x) => {
      invalidate();
      toast.success(x.active ? `${name} reactivated` : `${name} deactivated`);
    },
    onError: (err, next) => {
      if (next) toast.error(errorMessage(err));
    },
  });
  const op = kind === "faculty" ? "adminUpdateFaculty" : "adminUpdateDepartment";
  if (!active) {
    return (
      <GatedButton op={op} size="xs" variant="outline" onClick={() => m.mutate(true)} disabled={m.isPending} aria-label={`Reactivate ${name}`}>
        <Power aria-hidden /> Reactivate
      </GatedButton>
    );
  }
  return (
    <>
      <GatedButton op={op} size="xs" variant="ghost" onClick={() => setConfirm(true)} aria-label={`Deactivate ${name}`}>
        <PowerOff aria-hidden /> Deactivate
      </GatedButton>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Deactivate ${name}?`} confirmLabel="Deactivate" destructive onConfirm={() => m.mutateAsync(false)}>
        {kind === "faculty" ? (
          <p>
            <strong>{name}</strong> ({code}) can no longer be given to deans or new departments. The server refuses while it still has
            active departments or deans.
          </p>
        ) : (
          <p>
            <strong>{name}</strong> ({code}) disappears from the department lists in rules and user forms. Past payments keep it. The
            server refuses while a head of department or a rule on a fee that isn&apos;t closed uses it.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

// ── page ──

function NeedsReview({ onSetUp }: { onSetUp(d: ListedDepartment): void }) {
  const q = useNeedsReview();
  if (!q.data?.length) return null;
  return (
    <Card role="region" className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20" aria-labelledby="needs-review">
      <CardHeader className="pb-2">
        <CardTitle id="needs-review" className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-amber-600" aria-hidden /> Needs review ({q.data.length})
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          The portal sent these department codes for payers. Payments go through regardless; give each a name and a faculty so it can be used in
          rules, reports and head-of-department access.
        </p>
      </CardHeader>
      <CardContent>
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>First seen</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.map((d) => (
              <TableRow key={d.code}>
                <TableCell className="font-mono">{d.code}</TableCell>
                <TableCell>
                  <DateTime iso={d.createdAt} />
                </TableCell>
                <TableCell className="text-right">
                  <GatedButton op="adminUpdateDepartment" size="xs" onClick={() => onSetUp(d)}>
                    Set up
                  </GatedButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FacultyCard({ faculty, onEdit, onEditDepartment, onAddDepartment }: { faculty: Faculty; onEdit(): void; onEditDepartment(d: Department): void; onAddDepartment(): void }) {
  const departments = [...faculty.departments].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return (
    <Card role="region" className={cn(!faculty.active && "opacity-60")} aria-label={faculty.name} data-inactive={!faculty.active || undefined}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {faculty.name} {!faculty.active && <InactiveBadge />}
          </CardTitle>
          <div className="font-mono text-xs text-muted-foreground">{faculty.code}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {faculty.active && (
            <GatedButton op="adminCreateDepartment" size="xs" variant="ghost" onClick={onAddDepartment} aria-label={`Add a department to ${faculty.name}`}>
              <Plus aria-hidden /> Department
            </GatedButton>
          )}
          <GatedButton op="adminUpdateFaculty" size="icon-sm" variant="ghost" onClick={onEdit} aria-label={`Rename ${faculty.name}`}>
            <Pencil aria-hidden />
          </GatedButton>
          <ActiveButton kind="faculty" code={faculty.code} name={faculty.name} active={faculty.active} />
        </div>
      </CardHeader>
      <CardContent>
        {departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No departments yet.</p>
        ) : (
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="w-56" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((d) => (
                <TableRow key={d.code} className={cn(!d.active && "text-muted-foreground")} data-inactive={!d.active || undefined}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {d.name} {!d.active && <InactiveBadge />}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono">{d.code}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <GatedButton op="adminUpdateDepartment" size="icon-sm" variant="ghost" onClick={() => onEditDepartment(d)} aria-label={`Edit ${d.name}`}>
                      <Pencil aria-hidden />
                    </GatedButton>
                    <ActiveButton kind="department" code={d.code} name={d.name} active={d.active} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

type DialogState =
  | { kind: "faculty"; faculty?: Faculty }
  | { kind: "department"; department?: Parameters<typeof DepartmentDialog>[0]["department"]; defaultFaculty?: string }
  | null;

export function Academics() {
  const q = useFaculties();
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = (o: boolean) => !o && setDialog(null);
  const faculties = [...(q.data ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Faculties & departments"
        description="Department codes are what the portal sends for each payer and what fee rules, minimum instalments and heads of department use. Codes never change and nothing is deleted: deactivate instead."
        actions={
          <>
            <GatedButton op="adminCreateFaculty" size="sm" variant="outline" onClick={() => setDialog({ kind: "faculty" })}>
              <Plus aria-hidden /> Add faculty
            </GatedButton>
            <GatedButton op="adminCreateDepartment" size="sm" onClick={() => setDialog({ kind: "department" })}>
              <Plus aria-hidden /> Add department
            </GatedButton>
          </>
        }
      />
      <NeedsReview onSetUp={(d) => setDialog({ kind: "department", department: d })} />
      {q.isPending ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : faculties.length === 0 ? (
        <EmptyState title="No faculties yet">Add a faculty, then its departments.</EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {faculties.map((f) => (
            <FacultyCard
              key={f.code}
              faculty={f}
              onEdit={() => setDialog({ kind: "faculty", faculty: f })}
              onAddDepartment={() => setDialog({ kind: "department", defaultFaculty: f.code })}
              onEditDepartment={(d) => setDialog({ kind: "department", department: { ...d, facultyCode: f.code } })}
            />
          ))}
        </div>
      )}
      {dialog?.kind === "faculty" && <FacultyDialog open faculty={dialog.faculty} onOpenChange={close} />}
      {dialog?.kind === "department" && <DepartmentDialog open department={dialog.department} defaultFaculty={dialog.defaultFaculty} onOpenChange={close} />}
    </div>
  );
}
