"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import { CopyValue, DateTime } from "@/components/format";
import { BackLink, HistoryLink } from "@/components/history-link";
import { RequireOp } from "@/components/permission";
import { ErrorState, Field, Fields, LoadingBlock, PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { awaitingFirstSignIn } from "../invitation";
import { ResendInviteButton } from "../resend-invite";
import { ActiveToggle, EditButton, UserStateBadge } from "../users";

function Detail({ id }: { id: string }) {
  const q = useQuery({ queryKey: qk.user(id), queryFn: () => call(api.GET("/v1/admin/users/{id}", { params: { path: { id } } })) });
  if (q.isPending) return <LoadingBlock rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const u = q.data;
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <BackLink href="/users">Users</BackLink>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {u.name ?? u.email} <UserStateBadge user={u} />
            </span>
          }
          description={u.email}
          actions={
            <>
              <HistoryLink entity="AdminUser" entityId={u.id} />
              <ResendInviteButton user={u} size="sm" />
              <EditButton user={u} />
              <ActiveToggle user={u} />
            </>
          }
        />
      </div>
      {awaitingFirstSignIn(u) && (
        <Alert>
          <AlertTitle>Invited · not signed in</AlertTitle>
          <AlertDescription>
            The invite binds to their Supabase sign-in the first time they sign in. If the email never arrived or the link expired, re-send it.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="pt-4">
          <Fields>
            <Field label="Role">
              <Badge variant="secondary" className="font-mono text-[11px]">
                {u.role.replace(/_/g, " ")}
              </Badge>
            </Field>
            <Field label="Departments">{u.departments.join(", ") || "—"}</Field>
            <Field label="Extra permissions">
              <span className="font-mono text-xs">{u.extraPermissions.join(", ") || "—"}</span>
            </Field>
            <Field label="Last sign-in">{u.lastLoginAt ? <DateTime iso={u.lastLoginAt} /> : "Never"}</Field>
            <Field label="Invited">
              <DateTime iso={u.createdAt} />
            </Field>
            <Field label="Invited by">{u.createdBy ? <CopyValue value={u.createdBy} truncate /> : "—"}</Field>
            <Field label="Supabase user">{u.authUserId ? <CopyValue value={u.authUserId} truncate /> : "Not bound yet"}</Field>
            <Field label="Admin id">
              <CopyValue value={u.id} truncate />
            </Field>
            <Field label="Updated">
              <DateTime iso={u.updatedAt} />
            </Field>
          </Fields>
        </CardContent>
      </Card>
    </div>
  );
}

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireOp op="adminGetUser">
      <Detail id={id} />
    </RequireOp>
  );
}
