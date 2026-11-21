import type { components } from "@/api/schema.gen";
import { componentsParametersAnalyticsSortValues, componentsParametersAnalyticsStandingValues, enrolmentStatusValues, payerListItemKindValues } from "@/api/schema.gen";

type Params = NonNullable<components["parameters"]>;
export type ListSort = NonNullable<Params["AnalyticsSort"]>;
export type StandingFilter = NonNullable<Params["AnalyticsStanding"]>;
export type Kind = NonNullable<Params["AnalyticsKind"]>;
export type EnrolmentStatus = components["schemas"]["EnrolmentStatus"];

/** URL keys shared by the outstanding report and the students list (the grid drills into the list with them). */
export const REPORT_KEYS = ["feeId", "feeType", "period", "faculty", "department", "level", "includeInactive"] as const;
export const LIST_KEYS = [...REPORT_KEYS, "kind", "enrolmentStatus", "standing", "q", "sort"] as const;
export type ReportValues = Record<(typeof REPORT_KEYS)[number], string>;
export type ListValues = Record<(typeof LIST_KEYS)[number], string>;

export const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const DEFAULT_SORT: ListSort = "-balance";
export const SORTS = componentsParametersAnalyticsSortValues;
export const STANDINGS = componentsParametersAnalyticsStandingValues;

const oneOf = <T extends string>(v: string, values: readonly T[]): T | undefined => ((values as readonly string[]).includes(v) ? (v as T) : undefined);
const level = (v: string) => {
  const n = Number(v);
  return v !== "" && Number.isInteger(n) && n >= 1 && n <= 10 ? n : undefined;
};

/** Report query from the URL; junk values are dropped rather than sent (the server would 400). */
export function reportQuery(v: ReportValues) {
  return strip({
    feeId: v.feeId || undefined,
    feeType: v.feeType || undefined,
    period: v.period || undefined,
    faculty: v.faculty || undefined,
    department: v.department || undefined,
    level: level(v.level),
    includeInactive: v.includeInactive === "true" ? true : undefined,
  });
}

export function listQuery(v: ListValues) {
  return strip({
    ...reportQuery(v),
    kind: oneOf<Kind>(v.kind, payerListItemKindValues),
    enrolmentStatus: oneOf<EnrolmentStatus>(v.enrolmentStatus, enrolmentStatusValues),
    standing: oneOf<StandingFilter>(v.standing, STANDINGS),
    q: v.q.trim() || undefined,
  });
}

export function listSort(v: string): ListSort {
  return oneOf<ListSort>(v, SORTS) ?? DEFAULT_SORT;
}

/** Same filters as a plain record, for the CSV download. */
export function asStrings(q: Record<string, string | number | boolean | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v === undefined ? undefined : String(v)]));
}

function strip<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function href(params: Record<string, string | number | boolean | null | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `/students?${s}` : "/students";
}

/**
 * The students behind one grid cell: the report's filters plus the cell's department and
 * level, and a standing when a count was clicked.
 */
export function cellHref(v: ReportValues, cell: { department: string | null; level: number | null }, standing?: StandingFilter): string {
  const q = reportQuery(v);
  return href({ ...q, kind: "STUDENT", department: cell.department ?? q.department, level: cell.level ?? q.level, standing });
}

/**
 * Active students with nothing billed: academic filters only. A fee filter would leave them out
 * (the list then only shows payers billed for it), and the roster count ignores includeInactive.
 */
export function notBilledHref(v: ReportValues): string {
  const q = reportQuery(v);
  return href({ kind: "STUDENT", faculty: q.faculty, department: q.department, level: q.level, standing: "NOT_BILLED" });
}

/**
 * 0–4 for the heat map's five 20% bins; null = nothing billed. Binned on the whole percent the
 * cell shows, so "60% collected" never sits in the 40–59% colour.
 */
export function rateBin(rate: number | null): 0 | 1 | 2 | 3 | 4 | null {
  if (rate === null || Number.isNaN(rate)) return null;
  return Math.min(4, Math.max(0, Math.floor(Math.round(rate * 100) / 20))) as 0 | 1 | 2 | 3 | 4;
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export const STANDING_LABEL: Record<StandingFilter, string> = {
  NOT_BILLED: "Not billed",
  PAID: "Paid",
  PART_PAID: "Part-paid",
  UNPAID: "Unpaid",
  OVERDUE: "Overdue",
};

export const SORT_LABEL: Record<ListSort, string> = {
  "-balance": "Balance, highest first",
  balance: "Balance, lowest first",
  name: "Name",
  ref: "Ref",
};
