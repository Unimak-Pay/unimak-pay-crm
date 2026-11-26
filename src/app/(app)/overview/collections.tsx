"use client";

import { useQuery } from "@tanstack/react-query";
import { Table2, BarChart3 } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { channelValues } from "@/api/schema.gen";
import { useMe } from "@/auth/auth-provider";
import { AcademicFilters, departmentLabel, useAcademics } from "@/components/academics";
import { DayRangeFilter, FilterBar, FilterSelect } from "@/components/filters";
import { Money } from "@/components/format";
import { useCanOp } from "@/components/permission";
import { ErrorState, LoadingBlock } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compact, useUrlFilters } from "@/hooks/use-url-filters";
import { compareMinor, formatSle, formatSleCompact, minorToChartNumber } from "@/lib/money";
import { addDays, formatDay, formatDayShort, todayDay } from "@/lib/time";
import { cn } from "@/lib/utils";

type RawSummary = Awaited<ReturnType<typeof fetchSummary>>;
type CountAmount = components["schemas"]["CountAmount"];

/**
 * The reports schema in openapi.yaml lists no `required` properties, so every field is optional
 * in the generated types. Fill safe defaults in one place (backend gap: mark them required).
 */
function normalize(s: RawSummary, f: { from: string; to: string }) {
  const ca = (x?: CountAmount) => ({ count: x?.count ?? 0, amount: x?.amount ?? "0" });
  return {
    range: { from: s.range?.from ?? f.from, to: s.range?.to ?? f.to, days: s.range?.days ?? 0, timezone: s.range?.timezone ?? "Africa/Freetown (UTC)" },
    filters: { departments: s.filters?.departments ?? null, faculty: s.filters?.faculty ?? null, department: s.filters?.department ?? null },
    collected: {
      amount: s.collected?.amount ?? "0",
      count: s.collected?.count ?? 0,
      average: s.collected?.average ?? "0",
      monimeFees: s.collected?.monimeFees ?? "0",
      platformFees: s.collected?.platformFees ?? "0",
      net: s.collected?.net ?? "0",
      lateSettlements: s.collected?.lateSettlements ?? 0,
    },
    byDay: (s.byDay ?? []).map((d) => ({ date: d.date ?? "", amount: d.amount ?? "0", count: d.count ?? 0 })),
    byFeeType: (s.byFeeType ?? []).map((r) => ({ feeTypeCode: r.feeTypeCode ?? "?", feeTypeName: r.feeTypeName ?? "", amount: r.amount ?? "0", count: r.count ?? 0 })),
    byFaculty: (s.byFaculty ?? []).map((r) => ({ facultyCode: r.facultyCode ?? null, facultyName: r.facultyName ?? null, amount: r.amount ?? "0", count: r.count ?? 0 })),
    byDepartment: (s.byDepartment ?? []).map((r) => ({
      department: r.department ?? null,
      departmentName: r.departmentName ?? null,
      facultyCode: r.facultyCode ?? null,
      amount: r.amount ?? "0",
      count: r.count ?? 0,
    })),
    byChannel: (s.byChannel ?? []).map((r) => ({ channel: r.channel ?? "USSD", amount: r.amount ?? "0", count: r.count ?? 0 })),
    payments: {
      started: s.payments?.started ?? 0,
      completed: ca(s.payments?.completed),
      pending: ca(s.payments?.pending),
      processing: ca(s.payments?.processing),
      failed: ca(s.payments?.failed),
      expired: ca(s.payments?.expired),
      completionRate: s.payments?.completionRate ?? null,
    },
    commission: s.commission ? { transferred: ca(s.commission.transferred), inFlight: ca(s.commission.inFlight), failed: ca(s.commission.failed) } : null,
    payouts: s.payouts ? { paidOut: ca(s.payouts.paidOut), inFlight: ca(s.payouts.inFlight), failed: ca(s.payouts.failed) } : null,
  };
}
type Summary = ReturnType<typeof normalize>;

const KEYS = ["from", "to", "feeType", "channel", "faculty", "department"] as const;

function fetchSummary(f: { from: string; to: string; feeType?: string; channel?: string; faculty?: string; department?: string }) {
  return call(
    api.GET("/v1/admin/reports/summary", {
      params: { query: { ...f, channel: f.channel as components["schemas"]["Channel"] | undefined } },
    }),
  );
}

function Kpi({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{children}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

type ShareRow = { key: string; label: string; amount: string; count: number; onSelect?: () => void; selected?: boolean; hint?: string };

/** Horizontal share bars with direct labels (one hue: magnitude, not identity). */
function ShareBars({ rows }: { rows: ShareRow[] }) {
  const max = rows.reduce((m, r) => (compareMinor(r.amount, m) > 0 ? r.amount : m), "0");
  if (!rows.length) return <p className="py-4 text-sm text-muted-foreground">No completed payments in this range.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const pct = max === "0" ? 0 : Number((BigInt(r.amount) * 1000n) / BigInt(max)) / 10;
        return (
          <li key={r.key} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              {r.onSelect ? (
                <button
                  type="button"
                  onClick={r.onSelect}
                  aria-pressed={r.selected}
                  title={r.hint}
                  className={cn("truncate text-left underline-offset-2 hover:underline", r.selected && "font-semibold")}
                >
                  {r.label}
                </button>
              ) : (
                <span className="truncate" title={r.hint}>
                  {r.label}
                </span>
              )}
              <span className="shrink-0 tabular-nums">
                <Money minor={r.amount} /> <span className="text-xs text-muted-foreground">· {r.count}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted" aria-hidden>
              <div className="h-1.5 rounded-full bg-[var(--viz-series-1)]" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DailyChart({ byDay }: { byDay: Summary["byDay"] }) {
  const [asTable, setAsTable] = useState(false);
  const data = byDay.map((d) => ({ ...d, value: minorToChartNumber(d.amount) }));
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium">Collected per day</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? <BarChart3 aria-hidden /> : <Table2 aria-hidden />}
          {asTable ? "Chart" : "Table"}
        </Button>
      </CardHeader>
      <CardContent>
        {asTable ? (
          <div className="max-h-72 overflow-y-auto">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Payments</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDay.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell>{formatDay(d.date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.count}</TableCell>
                    <TableCell className="text-right">
                      <Money minor={d.amount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <ChartContainer config={{ value: { label: "Collected", color: "var(--viz-series-1)" } }} className="aspect-auto h-56 w-full">
            <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} strokeOpacity={0.4} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickFormatter={formatDayShort}
                minTickGap={24}
                fontSize={11}
              />
              <YAxis tickLine={false} axisLine={false} width={44} fontSize={11} tickFormatter={(v: number) => formatSleCompact(v)} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                  if (!active || !p) return null;
                  return (
                    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
                      <div className="font-medium">{formatDay(p.date)}</div>
                      <div className="tabular-nums">{formatSle(p.amount)}</div>
                      <div className="text-muted-foreground">
                        {p.count} {p.count === 1 ? "payment" : "payments"}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" fill="var(--viz-series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelRow({ label, count, amount, started, tone }: { label: string; count: number; amount: string; started: number; tone: string }) {
  const pct = started ? (count / started) * 100 : 0;
  return (
    <li className="text-sm" data-testid="funnel-row">
      <div className="flex items-baseline justify-between gap-3">
        <span>{label}</span>
        <span className="tabular-nums">
          {count} <span className="text-xs text-muted-foreground">({pct.toFixed(0)}%) · </span>
          <Money minor={amount} className="text-xs text-muted-foreground" />
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-muted" aria-hidden>
        <div className={cn("h-1.5 rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function CountAmountRows({ rows }: { rows: [string, { count?: number; amount?: string }][] }) {
  return (
    <dl className="space-y-1.5 text-sm">
      {rows.map(([label, v]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="tabular-nums">
            <Money minor={v.amount ?? "0"} /> <span className="text-xs text-muted-foreground">· {v.count ?? 0}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Collections() {
  const today = todayDay();
  const defaults = { from: addDays(today, -29), to: today };
  const { values, set, reset, active } = useUrlFilters(KEYS);
  const f = { ...defaults, ...compact(values) };
  const canOp = useCanOp();
  const me = useMe();
  const { departments: deptNames, faculties: facultyIndex } = useAcademics();

  const q = useQuery({ queryKey: qk.reports(f), queryFn: async () => normalize(await fetchSummary(f), f), placeholderData: (prev) => prev });
  const feeTypes = useQuery({
    queryKey: qk.feeTypes,
    queryFn: () => call(api.GET("/v1/admin/fee-types")),
    enabled: canOp("adminFeeTypes"),
  });
  const feeTypeOptions = feeTypes.data
    ? feeTypes.data.map((t) => ({ value: t.code, label: `${t.code} · ${t.name}` }))
    : (q.data?.byFeeType ?? []).map((t) => ({ value: t.feeTypeCode, label: t.feeTypeCode }));

  const s = q.data;
  return (
    <section aria-labelledby="collections-h" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="collections-h" className="text-base font-semibold">
          Collections
        </h2>
        {s && (
          <span className="text-xs text-muted-foreground">
            {formatDay(s.range.from)} – {formatDay(s.range.to)} · {s.range.days} days · {s.range.timezone}
            {s.filters.departments && ` · departments: ${s.filters.departments.map((c) => departmentLabel(c, deptNames)).join(", ")}`}
          </span>
        )}
      </div>
      <FilterBar onReset={reset} active={active}>
        <DayRangeFilter from={f.from} to={f.to} maxDays={366} onChange={(r) => set(r)} />
        <FilterSelect label="Fee type" value={values.feeType} onChange={(v) => set({ feeType: v })} options={feeTypeOptions} />
        <FilterSelect label="Channel" value={values.channel} onChange={(v) => set({ channel: v })} options={channelValues} />
        <AcademicFilters me={me} faculty={values.faculty} department={values.department} onChange={set} />
      </FilterBar>

      {q.isPending ? (
        <LoadingBlock rows={4} />
      ) : q.error && !s ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : s ? (
        <div className={cn("space-y-3 transition-opacity", q.isFetching && "opacity-60")}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Collected" hint={`${s.collected.count} payments`}>
              <Money minor={s.collected.amount} />
            </Kpi>
            <Kpi label="Payments">{s.collected.count.toLocaleString("en")}</Kpi>
            <Kpi label="Average payment">
              <Money minor={s.collected.average} />
            </Kpi>
            <Kpi label="Net after fees" hint={<>Monime fees <Money minor={s.collected.monimeFees} /></>}>
              <Money minor={s.collected.net} />
            </Kpi>
            <Kpi label="Platform commission">
              <Money minor={s.collected.platformFees} />
            </Kpi>
            <Kpi label="Late settlements" hint="Completed after their old 15-minute expiry">
              {s.collected.lateSettlements}
            </Kpi>
          </div>

          <DailyChart byDay={s.byDay} />

          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">By fee type</CardTitle>
              </CardHeader>
              <CardContent>
                <ShareBars
                  rows={[...s.byFeeType]
                    .sort((a, b) => compareMinor(b.amount, a.amount))
                    .map((r) => ({ key: r.feeTypeCode, label: `${r.feeTypeCode} · ${r.feeTypeName}`, amount: r.amount, count: r.count }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">By channel</CardTitle>
              </CardHeader>
              <CardContent>
                <ShareBars rows={s.byChannel.map((r) => ({ key: r.channel, label: r.channel === "DOTS" ? "DOTS (Dash Dots app)" : "USSD", amount: r.amount, count: r.count }))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Payment funnel</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-sm">
                  <span className="font-semibold tabular-nums">{s.payments.started}</span> started ·{" "}
                  <span className="font-semibold tabular-nums">
                    {s.payments.completionRate === null ? "—" : `${(s.payments.completionRate * 100).toFixed(1)}%`}
                  </span>{" "}
                  completed
                </p>
                {/* started → awaiting payment → processing → completed; payments no longer expire, so expired only shows for old ones */}
                <ul className="space-y-2.5" aria-label="Payment funnel" data-testid="payment-funnel">
                  <FunnelRow label="Awaiting payment" count={s.payments.pending.count} amount={s.payments.pending.amount} started={s.payments.started} tone="bg-muted-foreground/60" />
                  <FunnelRow label="Processing" count={s.payments.processing.count} amount={s.payments.processing.amount} started={s.payments.started} tone="bg-sky-600" />
                  <FunnelRow label="Completed" count={s.payments.completed.count} amount={s.payments.completed.amount} started={s.payments.started} tone="bg-emerald-600" />
                  <FunnelRow label="Failed" count={s.payments.failed.count} amount={s.payments.failed.amount} started={s.payments.started} tone="bg-red-600" />
                  {s.payments.expired.count > 0 && (
                    <FunnelRow label="Expired (before 28 Nov)" count={s.payments.expired.count} amount={s.payments.expired.amount} started={s.payments.started} tone="bg-muted-foreground/30" />
                  )}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">Unpaid payments are deleted after 7 days, so they drop out of the funnel.</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">By faculty</CardTitle>
                <p className="text-xs text-muted-foreground">Click a faculty to filter by it.</p>
              </CardHeader>
              <CardContent>
                <ShareBars
                  rows={[...s.byFaculty]
                    .sort((a, b) => compareMinor(b.amount, a.amount))
                    .map((r) => ({
                      key: r.facultyCode ?? "__none__",
                      label: r.facultyCode === null ? "No faculty yet" : (r.facultyName ?? facultyIndex.get(r.facultyCode)?.name ?? r.facultyCode),
                      hint: r.facultyCode === null ? "Payers whose department has no faculty yet (needs review), or no department" : r.facultyCode,
                      amount: r.amount,
                      count: r.count,
                      selected: r.facultyCode !== null && values.faculty === r.facultyCode,
                      onSelect:
                        r.facultyCode === null
                          ? undefined
                          : () => set(values.faculty === r.facultyCode ? { faculty: "", department: "" } : { faculty: r.facultyCode!, department: "" }),
                    }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">By department</CardTitle>
              </CardHeader>
              <CardContent className="max-h-80 overflow-y-auto">
                <ShareBars
                  rows={[...s.byDepartment]
                    .sort((a, b) => compareMinor(b.amount, a.amount))
                    .map((r) => ({
                      key: r.department ?? "__none__",
                      label: r.department === null ? "No department" : (r.departmentName ?? r.department),
                      hint: r.department ?? undefined,
                      amount: r.amount,
                      count: r.count,
                    }))}
                />
              </CardContent>
            </Card>
          </div>

          {(s.commission || s.payouts) && (
            <div className="grid gap-3 md:grid-cols-2">
              {s.commission && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Commission transfers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CountAmountRows rows={[["Transferred", s.commission.transferred], ["In flight", s.commission.inFlight], ["Failed", s.commission.failed]]} />
                  </CardContent>
                </Card>
              )}
              {s.payouts && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Payouts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CountAmountRows rows={[["Paid out", s.payouts.paidOut], ["In flight", s.payouts.inFlight], ["Failed", s.payouts.failed]]} />
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
