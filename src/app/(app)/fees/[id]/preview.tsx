"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Search, XCircle } from "lucide-react";
import { useState } from "react";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import { Money } from "@/components/format";
import { ErrorState, Field, Fields, LoadingBlock } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Kind = "student" | "applicant";
const REF_RE = /^[A-Za-z0-9_/-]{1,64}$/;

export function Preview({ feeId, defaultKind }: { feeId: string; defaultKind: Kind }) {
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [ref, setRef] = useState("");
  const [asked, setAsked] = useState<{ kind: Kind; ref: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({
    queryKey: qk.preview(feeId, asked?.kind ?? "", asked?.ref ?? ""),
    queryFn: () => call(api.GET("/v1/admin/fees/{id}/preview", { params: { path: { id: feeId }, query: { kind: asked!.kind, ref: asked!.ref } } })),
    enabled: !!asked,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = ref.trim();
    if (!REF_RE.test(r)) return setError("Enter a student ID or application ref");
    setError(null);
    setAsked({ kind, ref: r });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">What would this payer owe? Reads the payer from the portal and applies this fee&apos;s rules. Writes nothing.</p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2" noValidate>
        <div className="space-y-1">
          <Label htmlFor="pv-kind" className="text-xs">
            Payer
          </Label>
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger id="pv-kind" size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="applicant">Applicant</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pv-ref" className="text-xs">
            {kind === "student" ? "Student ID" : "Application ref"}
          </Label>
          <Input id="pv-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={kind === "student" ? "UNI-2025-0003" : "APP-2026-0001"} className="h-8 w-52 font-mono" />
        </div>
        <Button size="sm" type="submit">
          <Search aria-hidden /> Preview
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {asked && q.isPending && <LoadingBlock rows={3} />}
      {q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (
        <Card>
          <CardContent className="space-y-4 pt-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              {q.data.eligible && q.data.amount ? (
                <>
                  <CheckCircle2 className="size-5 text-emerald-600" aria-hidden /> {q.data.payer.ref} owes <Money minor={q.data.amount} className="text-base font-semibold" />
                </>
              ) : (
                <>
                  <XCircle className="size-5 text-muted-foreground" aria-hidden /> {q.data.payer.ref} {q.data.eligible ? "is eligible but has no price" : "is not eligible"}
                </>
              )}
            </div>
            {q.data.reason && <p className="text-sm text-muted-foreground">Reason: {q.data.reason}</p>}
            <Fields>
              <Field label="Eligible">{q.data.eligible ? "Yes" : "No"}</Field>
              <Field label="Amount">
                <Money minor={q.data.amount} />
              </Field>
              <Field label="Minimum instalment">
                <Money minor={q.data.minInstalment} />
              </Field>
              <Field label="Program">{q.data.payer.programCode}</Field>
              <Field label="Department">{q.data.payer.department ?? "—"}</Field>
              <Field label="Level">{q.data.payer.level ?? "—"}</Field>
              <Field label="Residency">{q.data.payer.residency.toLowerCase()}</Field>
              <Field label="Intake">{q.data.payer.intake ?? "—"}</Field>
              <Field label="Final year">{q.data.payer.finalYear ? "Yes" : "No"}</Field>
            </Fields>
            {q.data.fee.status !== "ACTIVE" && (
              <p className="text-xs text-muted-foreground">This fee is {q.data.fee.status}: payers are not charged it until it is active.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
