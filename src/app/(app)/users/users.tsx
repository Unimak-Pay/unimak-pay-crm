"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { adminRoleValues, permissionValues } from "@/api/schema.gen";
import { useMe } from "@/auth/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { columnsFor, DataTable } from "@/components/data-table";
import { DateTime } from "@/components/format";
import { FormDialog, FormField } from "@/components/form-dialog";
import { HistoryLink } from "@/components/history-link";
import { GatedButton, RequireOp } from "@/components/permission";
import { PageHeader } from "@/components/states";
import { ResendInviteButton, showInvitationToast } from "./resend-invite";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type User = components["schemas"]["AdminUser"];
type SaveResult = { kind: "updated"; u: User } | { kind: "invited"; u: components["schemas"]["InvitedAdminUser"] };
type Role = components["schemas"]["AdminRole"];
type Permission = components["schemas"]["Permission"];

const ROLE_HELP: Record<Role, string> = {
  SUPER_ADMIN: "Everything, incl. users, payouts and account provisioning. 2FA required.",
  BURSAR: "Fee setup, instalments, payments + reconcile, reconciliation, retries; reads accounts and payouts. 2FA required.",
  FINANCE_OFFICER: "Reads payments, accounts, payouts, transfers, reconciliation.",
  HEAD_OF_DEPARTMENT: "Reads fees and their departments' payments.",
  AUDITOR: "Every read permission, incl. the audit log.",
};

const schema = z
  .object({
    email: z.email("Enter an email").max(254),
    name: z.string().trim().max(100),
    role: z.enum(adminRoleValues as [Role, ...Role[]]),
    extraPermissions: z.array(z.string()),
    departments: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.role === "HEAD_OF_DEPARTMENT" && !parseDepartments(v.departments).length) {
      ctx.addIssue({ code: "custom", path: ["departments"], message: "A head of department needs at least one department" });
    }
  });
type Values = z.infer<typeof schema>;

function parseDepartments(s: string): string[] {
  return [...new Set(s.split(/[,\n]/).map((d) => d.trim().toUpperCase()).filter(Boolean))];
}

/** Invite or edit. The server refuses grants beyond your own permissions; its message is shown. */
export function UserDialog({ user, open, onOpenChange }: { user?: User; open: boolean; onOpenChange(o: boolean): void }) {
  const qc = useQueryClient();
  const me = useMe();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: user
      ? { email: user.email, name: user.name ?? "", role: user.role, extraPermissions: user.extraPermissions, departments: user.departments.join(", ") }
      : { email: "", name: "", role: "FINANCE_OFFICER", extraPermissions: [], departments: "" },
  });
  const role = useWatch({ control: form.control, name: "role" });
  const m = useMutation({
    mutationFn: (v: Values): Promise<SaveResult> => {
      const body = {
        name: v.name,
        role: v.role,
        extraPermissions: v.extraPermissions as Permission[],
        departments: v.role === "HEAD_OF_DEPARTMENT" ? parseDepartments(v.departments) : [],
      };
      return user
        ? call(api.PATCH("/v1/admin/users/{id}", { params: { path: { id: user.id } }, body })).then((u) => ({ kind: "updated" as const, u }))
        : call(api.POST("/v1/admin/users", { body: { ...body, email: v.email.trim().toLowerCase() } })).then((u) => ({ kind: "invited" as const, u }));
    },
    meta: { inlineError: true },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: qk.users });
      if (user) void qc.invalidateQueries({ queryKey: qk.user(user.id) });
      onOpenChange(false);
      if (r.kind === "invited") showInvitationToast(qc, r.u);
      else toast.success("Admin updated");
    },
  });
  const e = form.formState.errors;
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => (m.reset(), onOpenChange(o))}
      title={user ? `Edit ${user.email}` : "Invite an admin"}
      description={user ? undefined : "Supabase emails them an invite link to choose a password. You can only grant permissions you have yourself."}
      submitLabel={user ? "Save" : "Send invite"}
      pending={m.isPending}
      error={m.error}
      onSubmit={form.handleSubmit((v) => m.mutate(v))}
    >
      <FormField label="Email" htmlFor="u-email" error={e.email?.message}>
        <Input id="u-email" type="email" disabled={!!user} {...form.register("email")} />
      </FormField>
      <FormField label="Name (optional)" htmlFor="u-name" error={e.name?.message}>
        <Input id="u-name" {...form.register("name")} />
      </FormField>
      <FormField label="Role" htmlFor="u-role" hint={ROLE_HELP[role]}>
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="u-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {adminRoleValues.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      {role === "HEAD_OF_DEPARTMENT" && (
        <FormField label="Departments" htmlFor="u-depts" error={e.departments?.message} hint="Comma-separated, e.g. COMPUTING, NURSING">
          <Input id="u-depts" className="font-mono uppercase" {...form.register("departments")} />
        </FormField>
      )}
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Extra permissions</legend>
        <p className="text-xs text-muted-foreground">On top of the role. Ones you don&apos;t have are disabled.</p>
        <Controller
          control={form.control}
          name="extraPermissions"
          render={({ field }) => (
            <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
              {permissionValues.map((p) => {
                const mine = me.permissions.includes(p);
                const checked = field.value.includes(p);
                return (
                  <label key={p} className={`flex items-center gap-2 font-mono text-xs ${mine ? "" : "opacity-50"}`}>
                    <Checkbox
                      checked={checked}
                      disabled={!mine && !checked}
                      onCheckedChange={(c) => field.onChange(c ? [...field.value, p] : field.value.filter((x) => x !== p))}
                    />
                    {p}
                  </label>
                );
              })}
            </div>
          )}
        />
      </fieldset>
    </FormDialog>
  );
}

export function ActiveToggle({ user }: { user: User }) {
  const qc = useQueryClient();
  const me = useMe();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: (active: boolean) => call(api.PATCH("/v1/admin/users/{id}", { params: { path: { id: user.id } }, body: { active } })),
    meta: { inlineError: true },
    onSuccess: (u) => {
      void qc.invalidateQueries({ queryKey: qk.users });
      toast.success(u.active ? `${u.email} reactivated` : `${u.email} deactivated`);
    },
  });
  if (!user.active) {
    return (
      <GatedButton op="adminUpdateUser" size="xs" variant="outline" onClick={() => m.mutate(true)} disabled={m.isPending}>
        <UserCheck aria-hidden /> Reactivate
      </GatedButton>
    );
  }
  return (
    <>
      <GatedButton
        op="adminUpdateUser"
        size="xs"
        variant="outline"
        onClick={() => (m.reset(), setOpen(true))}
        disabledReason={user.id === me.id ? "You cannot deactivate yourself" : null}
      >
        <UserX aria-hidden /> Deactivate
      </GatedButton>
      <ConfirmDialog open={open} onOpenChange={setOpen} title={`Deactivate ${user.email}?`} confirmLabel="Deactivate" destructive onConfirm={() => m.mutateAsync(false)}>
        <p>
          <strong>{user.name ?? user.email}</strong> ({user.role.replace(/_/g, " ")}) can no longer use the dashboard or the admin API. Their
          next request is refused. You can reactivate them later.
        </p>
      </ConfirmDialog>
    </>
  );
}

export function EditButton({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <GatedButton op="adminUpdateUser" size="icon-sm" variant="ghost" aria-label={`Edit ${user.email}`} onClick={() => setOpen(true)}>
        <Pencil aria-hidden />
      </GatedButton>
      {open && <UserDialog user={user} open={open} onOpenChange={setOpen} />}
    </>
  );
}

export function userState(u: User): "Active" | "Invited · not signed in" | "Deactivated" {
  return !u.active ? "Deactivated" : u.authUserId === null ? "Invited · not signed in" : "Active";
}

export function UserStateBadge({ user }: { user: User }) {
  const s = userState(user);
  return (
    <Badge variant="outline" className={s === "Deactivated" ? "text-muted-foreground" : s === "Active" ? "" : "border-amber-500/50 text-amber-800 dark:text-amber-300"}>
      {s}
    </Badge>
  );
}

const col = columnsFor<User>();
const columns = [
  col.accessor("email", {
    header: "Admin",
    cell: (c) => (
      <div>
        <div className="font-medium">{c.row.original.name ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{c.getValue()}</div>
      </div>
    ),
  }),
  col.accessor("role", { header: "Role", cell: (c) => <Badge variant="secondary" className="font-mono text-[11px]">{c.getValue().replace(/_/g, " ")}</Badge> }),
  col.accessor((u) => u.departments.join(", "), { id: "departments", header: "Departments", cell: (c) => c.getValue() || <span className="text-muted-foreground">—</span> }),
  col.accessor((u) => u.extraPermissions.join(", "), {
    id: "extra",
    header: "Extra permissions",
    cell: (c) => <span className="block max-w-56 truncate font-mono text-[11px]" title={c.getValue()}>{c.getValue() || "—"}</span>,
  }),
  col.accessor(userState, { id: "state", header: "State", cell: (c) => <UserStateBadge user={c.row.original} /> }),
  col.accessor((u) => u.lastLoginAt ?? "", { id: "lastLogin", header: "Last sign-in", cell: (c) => <DateTime iso={c.row.original.lastLoginAt} /> }),
  col.display({
    id: "actions",
    header: "",
    cell: (c) => (
      <div className="flex items-center justify-end gap-1">
        <ResendInviteButton user={c.row.original} />
        <HistoryLink entity="AdminUser" entityId={c.row.original.id} iconOnly />
        <EditButton user={c.row.original} />
        <ActiveToggle user={c.row.original} />
      </div>
    ),
  }),
];

function Page() {
  const q = useQuery({ queryKey: qk.users, queryFn: () => call(api.GET("/v1/admin/users")) });
  const [invite, setInvite] = useState(false);
  return (
    <>
      <PageHeader
        title="Users"
        description="Admins are invite-only. The server never lets you grant more than you have, deactivate yourself, or remove the last super admin."
        actions={
          <GatedButton op="adminCreateUser" size="sm" onClick={() => setInvite(true)}>
            <Plus aria-hidden /> Invite admin
          </GatedButton>
        }
      />
      <DataTable
        columns={columns}
        rows={q.data}
        getRowId={(u) => u.id}
        isLoading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowHref={(u) => `/users/${u.id}`}
        emptyTitle="No admins"
      />
      {invite && <UserDialog open={invite} onOpenChange={setInvite} />}
    </>
  );
}

export function Users() {
  return (
    <RequireOp op="adminListUsers">
      <Page />
    </RequireOp>
  );
}
