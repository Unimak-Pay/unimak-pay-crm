"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { useMe } from "@/auth/auth-provider";
import { AcademicFilters, useScopeNames } from "@/components/academics";
import { FilterBar } from "@/components/filters";
import { DateTime, Day, Money } from "@/components/format";
import { RequireOp } from "@/components/permission";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { SyncBadge, useNow } from "../../portal/events/events";
import { formatRate, notBilledHref, REPORT_KEYS, reportQuery } from "../drill";
import { FeeFilters, IncludeInactiveSwitch, LevelFilter } from "../shared";
import { HeatLegend, HeatMap } from "./heat-map";

type Report = components["schemas"]["OutstandingReport"];

function Kpi({ label, children, hint, testId }: { label: string; children: React.ReactNode; hint?: React.ReactNode; testId?: string }) {
  return (
    <div className="rounded-md border p-3" data-testid={testId}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{children}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Totals({ r }: { r: Report }) {
  const t = r.totals;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7" data-testid="outstanding-totals">
      <Kpi label="Students billed" testId="kpi-students" hint={`of ${r.roster.activeStudents} active in the roster`}>
        {t.students}
      </Kpi>
      <Kpi label="Billed">
        <Money minor={t.billed} />
      </Kpi>
      <Kpi label="Collected">
        <Money minor={t.collected} />
      </Kpi>
      <Kpi label="Collection rate" testId="kpi-rate" hint="collected ÷ billed">
        {formatRate(t.collectionRate)}
      </Kpi>
      <Kpi label="Outstanding" testId="kpi-outstanding">
        <Money minor={t.outstanding} />
      </Kpi>
      <Kpi label="Overdue" testId="kpi-overdue" hint={`${t.overdue} ${t.overdue === 1 ? "student" : "students"} past a due date`}>
        <Money minor={t.overdueAmount} />
      </Kpi>
      <Kpi label="Paid · part-paid · unpaid · overdue" testId="kpi-standing">
        {t.paid} · {t.partPaid} · {t.unpaid} · {t.overdue}
      </Kpi>
    </div>
  );
}

function ByFee({ rows, onPick, selected }: { rows: Report["byFee"]; onPick(id: string): void; selected: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">By fee</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Fee</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Obligations</TableHead>
                <TableHead className="text-right">Billed</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Collected %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                    Nothing billed for these filters.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((f) => (
                <TableRow key={f.feeId} data-testid="by-fee-row">
                  <TableCell>
                    <button type="button" className="text-left underline-offset-2 hover:underline" aria-pressed={selected === f.feeId} onClick={() => onPick(f.feeId)}>
                      {f.feeName}
                    </button>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {f.feeTypeCode} · {f.period}
                    </div>
                  </TableCell>
                  <TableCell>{f.dueDate ? <Day day={f.dueDate.slice(0, 10)} /> : <span className="text-muted-foreground">No due date</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{f.obligations}</TableCell>
                  <TableCell className="text-right">
                    <Money minor={f.billed} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money minor={f.collected} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <Money minor={f.outstanding} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatRate(f.collectionRate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Applicants({ rows }: { rows: Report["applicants"]["byStatus"] }) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium">Applicants by status</CardTitle>
        <Link href="/students?kind=APPLICANT" className="inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline">
          All applicants <ArrowRight className="size-3" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No applicant fees for these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-[13px]" aria-label="Applicants by status">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Applicants</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.status ?? "none"} data-testid="applicant-status-row">
                    <TableCell>{s.status?.replace(/_/g, " ") ?? <span className="text-muted-foreground">No status</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.applicants}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.paid}</TableCell>
                    <TableCell className="text-right">
                      <Money minor={s.billed} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money minor={s.collected} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Money minor={s.outstanding} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OutstandingReport() {
  const me = useMe();
  const scope = useScopeNames(me.departments, me.faculties);
  const now = useNow();
  const { values, set, reset, active } = useUrlFilters(REPORT_KEYS);
  const query = reportQuery(values);
  const q = useQuery({ queryKey: qk.outstanding(query), queryFn: () => call(api.GET("/v1/admin/reports/outstanding", { params: { query } })) });
  // fee choices for admins without fees.read: the fees the report lists
  const fallback = q.data ? q.data.byFee.map((f) => ({ id: f.feeId, name: f.feeName, period: f.period, feeTypeCode: f.feeTypeCode })) : undefined;
  const r = q.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Outstanding"
        description={
          <>
            What students were billed, have paid and still owe, by department and level. Click a cell for its students, or a count for just those.
            {me.departmentScoped && ` Only ${scope.departments.join(", ") || "your departments"}.`}
          </>
        }
        actions={r ? <SyncBadge lastAppliedAt={r.roster.lastPortalEventAt} now={now} data /> : null}
      />
      <FilterBar onReset={reset} active={active}>
        <FeeFilters feeId={values.feeId} feeType={values.feeType} period={values.period} onChange={set} fallback={fallback} />
        <AcademicFilters me={me} faculty={values.faculty} department={values.department} onChange={set} />
        <LevelFilter value={values.level} onChange={(v) => set({ level: v })} />
        <IncludeInactiveSwitch value={values.includeInactive === "true"} onChange={(v) => set({ includeInactive: v ? "true" : "" })} />
      </FilterBar>

      {q.isPending ? (
        <LoadingBlock rows={8} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        r && (
          <>
            {r.roster.withoutObligations > 0 && (
              <Alert data-testid="not-billed-warning" className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <AlertTriangle aria-hidden />
                <AlertTitle>
                  {r.roster.withoutObligations} active {r.roster.withoutObligations === 1 ? "student has" : "students have"} no fees: check rate rules
                </AlertTitle>
                <AlertDescription className="text-current">
                  <span>
                    The portal sent them but no active fee matched, so they aren&apos;t counted above.{" "}
                    <Link href={notBilledHref(values)} className="font-medium underline underline-offset-2">
                      See who
                    </Link>
                  </span>
                </AlertDescription>
              </Alert>
            )}
            <Totals r={r} />
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">By department and level</CardTitle>
                <HeatLegend />
              </CardHeader>
              <CardContent>
                {r.grid.length === 0 ? (
                  <EmptyState title={active ? "No students billed for these filters" : "No students billed yet"}>
                    {r.roster.activeStudents === 0 ? "The roster is empty until the portal sends students." : null}
                  </EmptyState>
                ) : (
                  <HeatMap grid={r.grid} values={values} />
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  As of <DateTime iso={r.asOf} />. {values.includeInactive === "true" ? "Includes" : "Leaves out"} suspended, withdrawn and graduated students
                  {values.includeInactive === "true" ? "." : " (they're in Needs review)."}
                </p>
              </CardContent>
            </Card>
            <div className="grid gap-4">
              <ByFee rows={r.byFee} selected={values.feeId} onPick={(id) => set({ feeId: values.feeId === id ? "" : id, feeType: "", period: "" })} />
              <Applicants rows={r.applicants.byStatus} />
            </div>
          </>
        )
      )}
    </div>
  );
}

export function Outstanding() {
  return (
    <RequireOp op="adminReportsOutstanding">
      <OutstandingReport />
    </RequireOp>
  );
}
