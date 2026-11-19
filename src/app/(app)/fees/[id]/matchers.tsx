"use client";

import { z } from "zod";
import type { components } from "@/api/schema.gen";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Matchers = components["schemas"]["Matchers"];
const ANY = "__any__";

/** Form state: strings, "" = any. */
export const zMatchers = z.object({
  programCode: z.string().trim().max(20),
  department: z.string().trim().max(50),
  level: z.string().regex(/^$|^([1-9]|10)$/, "1–10"),
  residency: z.enum(["", "LOCAL", "INTERNATIONAL"]),
  intake: z.string().regex(/^$|^[A-Za-z0-9-]{4,20}$/, "Like 2026-SEP"),
});
export type MatcherValues = z.infer<typeof zMatchers>;

export const EMPTY_MATCHERS: MatcherValues = { programCode: "", department: "", level: "", residency: "", intake: "" };

/** Form → API body (omitted/null = any). */
export function toMatchers(v: MatcherValues): Matchers {
  return {
    programCode: v.programCode ? v.programCode.toUpperCase() : null,
    department: v.department ? v.department.toUpperCase() : null,
    level: v.level ? Number(v.level) : null,
    residency: v.residency || null,
    intake: v.intake ? v.intake.toUpperCase() : null,
  };
}

export function fromMatchers(m: Matchers): MatcherValues {
  return {
    programCode: m.programCode ?? "",
    department: m.department ?? "",
    level: m.level ? String(m.level) : "",
    residency: m.residency ?? "",
    intake: m.intake ?? "",
  };
}

export function specificity(m: Matchers): number {
  return [m.programCode, m.department, m.level, m.residency, m.intake].filter((x) => x !== null && x !== undefined).length;
}

/** "BSC-NURS · international" / "Everyone". */
export function describeMatchers(m: Matchers): string {
  const parts = [
    m.programCode,
    m.department && `dept ${m.department}`,
    m.level && `level ${m.level}`,
    m.residency && m.residency.toLowerCase(),
    m.intake && `intake ${m.intake}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Everyone";
}

export function AnyCell({ value }: { value: string | number | null | undefined }) {
  return value === null || value === undefined || value === "" ? <span className="text-muted-foreground">any</span> : <span className="font-mono">{value}</span>;
}

type FieldProps = {
  values: MatcherValues;
  onChange(patch: Partial<MatcherValues>): void;
  errors?: Partial<Record<keyof MatcherValues, string>>;
  disabled?: boolean;
  idPrefix: string;
  /** Wrap each field (e.g. in a <TableCell>). */
  wrap?: (field: React.ReactNode, key: string) => React.ReactNode;
};

/** Compact inline inputs for the five matchers (empty = any). */
export function MatcherInputs({ values, onChange, errors = {}, disabled, idPrefix, wrap = (f, k) => <div key={k}>{f}</div> }: FieldProps) {
  const cls = "h-8 font-mono text-xs uppercase placeholder:normal-case placeholder:font-sans";
  const fields: [string, React.ReactNode][] = [
    [
      "program",
      <>
        <Input aria-label="Program code" id={`${idPrefix}-program`} placeholder="any program" value={values.programCode} disabled={disabled} onChange={(e) => onChange({ programCode: e.target.value })} className={cls} />
        {errors.programCode && <p className="text-xs text-destructive">{errors.programCode}</p>}
      </>,
    ],
    [
      "department",
      <>
        <Input aria-label="Department" placeholder="any dept" value={values.department} disabled={disabled} onChange={(e) => onChange({ department: e.target.value })} className={cls} />
        {errors.department && <p className="text-xs text-destructive">{errors.department}</p>}
      </>,
    ],
    [
      "level",
      <>
        <Input aria-label="Level" placeholder="any" inputMode="numeric" value={values.level} disabled={disabled} onChange={(e) => onChange({ level: e.target.value.replace(/\D/g, "") })} className={`${cls} w-16`} />
        {errors.level && <p className="text-xs text-destructive">{errors.level}</p>}
      </>,
    ],
    [
      "residency",
      <>
        <Select value={values.residency || ANY} onValueChange={(v) => onChange({ residency: (v === ANY ? "" : v) as MatcherValues["residency"] })} disabled={disabled}>
          <SelectTrigger aria-label="Residency" size="sm" className="w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>any residency</SelectItem>
            <SelectItem value="LOCAL">Local</SelectItem>
            <SelectItem value="INTERNATIONAL">International</SelectItem>
          </SelectContent>
        </Select>
      </>,
    ],
    [
      "intake",
      <>
        <Input aria-label="Intake" placeholder="any intake" value={values.intake} disabled={disabled} onChange={(e) => onChange({ intake: e.target.value })} className={`${cls} w-28`} />
        {errors.intake && <p className="text-xs text-destructive">{errors.intake}</p>}
      </>,
    ],
  ];
  return <>{fields.map(([k, f]) => wrap(f, k))}</>;
}

/** Validates matcher form values; returns field errors or null. */
export function matcherErrors(v: MatcherValues): Partial<Record<keyof MatcherValues, string>> | null {
  const r = zMatchers.safeParse(v);
  if (r.success) return null;
  const out: Partial<Record<keyof MatcherValues, string>> = {};
  for (const i of r.error.issues) out[i.path[0] as keyof MatcherValues] = i.message;
  return out;
}
