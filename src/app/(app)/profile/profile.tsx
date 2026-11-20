"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useMe } from "@/auth/auth-provider";
import { useScopeNames } from "@/components/academics";
import { CopyValue, DateTime } from "@/components/format";
import { ErrorState, Field, Fields, LoadingBlock, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabase } from "@/lib/supabase";

function Authenticators() {
  const q = useQuery({
    queryKey: ["supabase", "factors"],
    queryFn: async () => {
      const { data, error } = await getSupabase().auth.mfa.listFactors();
      if (error) throw error;
      return data.all.filter((f) => f.factor_type === "totp");
    },
  });
  if (q.isPending) return <LoadingBlock rows={1} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const verified = q.data.filter((f) => f.status === "verified");
  if (!verified.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldOff className="size-4" aria-hidden /> No authenticator app enrolled. Your role does not require one.
      </p>
    );
  }
  return (
    <ul className="space-y-2 text-sm">
      {verified.map((f) => (
        <li key={f.id} className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-emerald-600" aria-hidden />
          <span>Authenticator app{f.friendly_name ? ` · ${f.friendly_name}` : ""}</span>
          <span className="text-muted-foreground">
            added <DateTime iso={f.created_at} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Profile() {
  const me = useMe();
  const scope = useScopeNames(me.departments, me.faculties);
  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Profile" description="Your admin account, as the backend sees it." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Fields>
            <Field label="Email">{me.email}</Field>
            <Field label="Role">
              <Badge variant="secondary" className="font-mono">{me.role.replace(/_/g, " ")}</Badge>
            </Field>
            <Field label="Session">{me.aal === "aal2" ? "Verified with 2FA (aal2)" : "Password only (aal1)"}</Field>
            <Field label="Admin id">
              <CopyValue value={me.id} />
            </Field>
            {me.faculties.length > 0 && (
              <Field label="Faculties" className="sm:col-span-2">
                {scope.faculties.join(", ")}
              </Field>
            )}
            {me.departmentScoped && (
              <Field label="Departments" className="sm:col-span-2">
                {me.departments.length ? scope.departments.join(", ") : "None assigned: you will not see any payments."}
              </Field>
            )}
          </Fields>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Two-factor authentication</CardTitle>
        </CardHeader>
        <CardContent>
          <Authenticators />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permissions ({me.permissions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-wrap gap-1.5">
            {[...me.permissions].sort().map((p) => (
              <li key={p}>
                <Badge variant="outline" className="font-mono text-[11px]">{p}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
