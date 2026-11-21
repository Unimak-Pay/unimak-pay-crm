"use client";

import Link from "next/link";
import { Fragment } from "react";
import type { components } from "@/api/schema.gen";
import { formatSle, formatSleCompact, minorToChartNumber } from "@/lib/money";
import { cn } from "@/lib/utils";
import { cellHref, formatRate, rateBin, type ReportValues, type StandingFilter } from "../drill";

type Cell = components["schemas"]["OutstandingReport"]["grid"][number];

const BINS = [0, 1, 2, 3, 4] as const;
const BIN_LABEL = ["0–19%", "20–39%", "40–59%", "60–79%", "80–100%"];

/** Legend: five bins of one hue plus grey for nothing billed. Shown above the grid. */
export function HeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Colour key: share of what was billed that has been collected">
      <span>Collected</span>
      {BINS.map((b) => (
        <span key={b} className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm" style={{ background: `var(--heat-${b})` }} aria-hidden />
          {BIN_LABEL[b]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="size-3 rounded-sm bg-muted ring-1 ring-border" aria-hidden />
        Nothing billed
      </span>
    </div>
  );
}

const levelName = (l: number | null) => (l === null ? "No level" : `Level ${l}`);

function Count({ n, label, href, what }: { n: number; label: string; href: string; what: string }) {
  if (n === 0) return <span className="opacity-75">0 {label}</span>;
  return (
    <Link href={href} className="relative z-10 underline decoration-current/40 underline-offset-2 hover:decoration-current" aria-label={`${n} ${label} in ${what}: show them`}>
      {n} {label}
    </Link>
  );
}

function HeatCell({ c, values, what }: { c: Cell; values: ReportValues; what: string }) {
  const bin = rateBin(c.collectionRate);
  const link = (s?: StandingFilter) => cellHref(values, c, s);
  return (
    <td
      data-testid="heat-cell"
      data-department={c.department ?? ""}
      data-level={c.level ?? ""}
      data-bin={bin ?? "none"}
      className={cn("relative min-w-36 border-2 border-background p-2 align-top text-xs", bin === null && "bg-muted text-muted-foreground")}
      style={bin === null ? undefined : { background: `var(--heat-${bin})`, color: `var(--heat-ink-${bin})` }}
      title={`${what}: billed ${formatSle(c.billed)}, collected ${formatSle(c.collected)}, outstanding ${formatSle(c.outstanding)}, overdue ${formatSle(c.overdueAmount)}`}
    >
      {/* the whole cell opens the list; the counts above it narrow it to a standing */}
      <Link
        href={link()}
        className="block after:absolute after:inset-0 after:rounded-sm focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        aria-label={`${what}: ${c.students} students, ${formatRate(c.collectionRate)} collected, ${formatSle(c.outstanding)} outstanding. Show students`}
      >
        <span className="block text-sm font-semibold tabular-nums">SLE {formatSleCompact(minorToChartNumber(c.outstanding))}</span>
        <span className="block opacity-80">
          {formatRate(c.collectionRate)} collected · {c.students} {c.students === 1 ? "student" : "students"}
        </span>
      </Link>
      <span className="mt-1 flex flex-wrap gap-x-2 tabular-nums">
        <Count n={c.paid} label="paid" href={link("PAID")} what={what} />
        <Count n={c.partPaid} label="part" href={link("PART_PAID")} what={what} />
        <Count n={c.unpaid} label="unpaid" href={link("UNPAID")} what={what} />
        <Count n={c.overdue} label="overdue" href={link("OVERDUE")} what={what} />
      </span>
    </td>
  );
}

/**
 * Department × level grid from `grid`, departments grouped by faculty (the server's order).
 * Colour = collection rate; every number is also in the cell text, so colour is never the only cue.
 */
export function HeatMap({ grid, values }: { grid: Cell[]; values: ReportValues }) {
  const levels = [...new Set(grid.map((c) => c.level))].sort((a, b) => (a === null ? 1 : b === null ? -1 : a - b));
  const faculties: { code: string | null; name: string; departments: { code: string | null; name: string; cells: Map<number | null, Cell> }[] }[] = [];
  for (const c of grid) {
    let f = faculties.find((x) => x.code === c.facultyCode);
    if (!f) faculties.push((f = { code: c.facultyCode, name: c.facultyName ?? "No faculty yet", departments: [] }));
    let d = f.departments.find((x) => x.code === c.department);
    if (!d) f.departments.push((d = { code: c.department, name: c.departmentName ?? c.department ?? "No department", cells: new Map() }));
    d.cells.set(c.level, c);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left" aria-label="Outstanding by department and level">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="p-2 font-medium">
              Department
            </th>
            {levels.map((l) => (
              <th key={String(l)} scope="col" className="p-2 font-medium">
                {levelName(l)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {faculties.map((f) => (
            <Fragment key={f.code ?? "none"}>
              <tr>
                <th scope="colgroup" colSpan={levels.length + 1} className="px-2 pt-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {f.name}
                </th>
              </tr>
              {f.departments.map((d) => (
                <tr key={d.code ?? "none"} data-testid="heat-row">
                  <th scope="row" className="max-w-48 p-2 align-top text-sm font-medium">
                    {d.name}
                  </th>
                  {levels.map((l) => {
                    const c = d.cells.get(l);
                    const what = `${d.name} ${levelName(l).toLowerCase()}`;
                    return c ? (
                      <HeatCell key={String(l)} c={c} values={values} what={what} />
                    ) : (
                      <td key={String(l)} className="border-2 border-background bg-muted/40 p-2 text-center align-middle text-xs text-muted-foreground" title={`${what}: no students billed`}>
                        —
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
