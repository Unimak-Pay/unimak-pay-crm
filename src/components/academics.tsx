"use client";

/**
 * Faculties → departments, shared by every form, filter and label that shows a department.
 * Department codes are what the portal sends and what rules store, so forms offer a dropdown of
 * active, reviewed departments (grouped by faculty), never free text; the server rejects
 * anything else with 400.
 */
import { useQuery } from "@tanstack/react-query";
import { useId, useMemo } from "react";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type Faculty = components["schemas"]["FacultyWithDepartments"];
export type Department = components["schemas"]["Department"];
export type DepartmentInfo = { code: string; name: string; active: boolean; facultyCode: string | null; facultyName: string | null };

/** Every faculty with its departments. Any admin may read it; it rarely changes. */
export function useFaculties() {
  return useQuery({
    queryKey: qk.faculties,
    queryFn: () => call(api.GET("/v1/admin/faculties")),
    staleTime: 5 * 60_000,
  });
}

/** Departments the portal sent that nobody has set up yet (drives the nav badge). */
export function useNeedsReview() {
  return useQuery({
    queryKey: qk.departments({ needsReview: true }),
    queryFn: () => call(api.GET("/v1/admin/departments", { params: { query: { needsReview: true } } })),
    staleTime: 60_000,
  });
}

/** Lookups by code. Departments needing review aren't under a faculty, so they're absent here. */
export function useAcademics() {
  const q = useFaculties();
  const index = useMemo(() => {
    const departments = new Map<string, DepartmentInfo>();
    const faculties = new Map<string, Faculty>();
    for (const f of q.data ?? []) {
      faculties.set(f.code, f);
      for (const d of f.departments) departments.set(d.code, { code: d.code, name: d.name, active: d.active, facultyCode: f.code, facultyName: f.name });
    }
    return { departments, faculties };
  }, [q.data]);
  return { ...q, ...index };
}

/** Active, reviewed departments grouped by (active) faculty: what forms may offer. */
export function usableGroups(faculties: Faculty[] | undefined, limitTo?: readonly string[]) {
  return (faculties ?? [])
    .filter((f) => f.active)
    .map((f) => ({
      faculty: f,
      departments: f.departments.filter((d) => d.active && !d.needsReview && (!limitTo || limitTo.includes(d.code))).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.departments.length > 0)
    .sort((a, b) => a.faculty.name.localeCompare(b.faculty.name));
}

/** "Computer Science" (code on hover); the bare code while loading or if unknown. */
export function DepartmentName({ code, className }: { code: string | null | undefined; className?: string }) {
  const { departments } = useAcademics();
  if (!code) return <span className="text-muted-foreground">—</span>;
  const d = departments.get(code);
  return (
    <span className={cn(!d && "font-mono", className)} title={code}>
      {d?.name ?? code}
      {d && !d.active && <span className="text-muted-foreground"> (inactive)</span>}
    </span>
  );
}

export function departmentLabel(code: string, departments: Map<string, DepartmentInfo>): string {
  return departments.get(code)?.name ?? code;
}

const ANY = "__any__";

/**
 * Single department dropdown. `anyLabel` adds an "any"/"all" option mapped to "". A current value
 * that is no longer offered (inactive, moved) stays visible so editing doesn't silently drop it.
 */
export function DepartmentSelect({
  value,
  onChange,
  anyLabel,
  limitTo,
  id,
  "aria-label": ariaLabel,
  className,
  size = "sm",
  disabled,
  placeholder = "Choose a department",
}: {
  value: string;
  onChange(code: string): void;
  anyLabel?: string;
  limitTo?: readonly string[];
  id?: string;
  "aria-label"?: string;
  className?: string;
  size?: "sm" | "default";
  disabled?: boolean;
  placeholder?: string;
}) {
  const { data, departments, isPending } = useAcademics();
  const groups = usableGroups(data, limitTo);
  const offered = new Set(groups.flatMap((g) => g.departments.map((d) => d.code)));
  const stray = value && !offered.has(value) ? value : null;
  return (
    <Select value={value || (anyLabel ? ANY : "")} onValueChange={(v) => onChange(v === ANY ? "" : v)} disabled={disabled || isPending}>
      <SelectTrigger id={id} aria-label={ariaLabel} size={size} className={cn("min-w-40 text-xs", className)}>
        <SelectValue placeholder={isPending ? "Loading…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {anyLabel && <SelectItem value={ANY}>{anyLabel}</SelectItem>}
        {stray && (
          <SelectItem value={stray}>
            {departmentLabel(stray, departments)} (not available)
          </SelectItem>
        )}
        {groups.map((g) => (
          <SelectGroup key={g.faculty.code}>
            <SelectLabel>{g.faculty.name}</SelectLabel>
            {g.departments.map((d) => (
              <SelectItem key={d.code} value={d.code}>
                {d.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Faculty dropdown (active faculties unless `includeInactive`). */
export function FacultySelect({
  value,
  onChange,
  anyLabel,
  limitTo,
  id,
  "aria-label": ariaLabel,
  className,
  size = "sm",
  includeInactive,
  placeholder = "Choose a faculty",
}: {
  value: string;
  onChange(code: string): void;
  anyLabel?: string;
  limitTo?: readonly string[];
  id?: string;
  "aria-label"?: string;
  className?: string;
  size?: "sm" | "default";
  includeInactive?: boolean;
  placeholder?: string;
}) {
  const { data, isPending } = useFaculties();
  const options = (data ?? []).filter((f) => (includeInactive || f.active || f.code === value) && (!limitTo || limitTo.includes(f.code)));
  return (
    <Select value={value || (anyLabel ? ANY : "")} onValueChange={(v) => onChange(v === ANY ? "" : v)} disabled={isPending}>
      <SelectTrigger id={id} aria-label={ariaLabel} size={size} className={cn("min-w-40 text-xs", className)}>
        <SelectValue placeholder={isPending ? "Loading…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {anyLabel && <SelectItem value={ANY}>{anyLabel}</SelectItem>}
        {options.map((f) => (
          <SelectItem key={f.code} value={f.code}>
            {f.name}
            {!f.active && " (inactive)"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CheckList({
  legend,
  groups,
  value,
  onChange,
  invalid,
}: {
  legend: string;
  groups: { label: string | null; items: { value: string; label: string }[] }[];
  value: readonly string[];
  onChange(v: string[]): void;
  invalid?: boolean;
}) {
  const base = useId();
  const toggle = (v: string, on: boolean) => onChange(on ? [...value, v] : value.filter((x) => x !== v));
  return (
    <fieldset aria-invalid={invalid || undefined} className={cn("max-h-56 overflow-y-auto rounded-md border p-2", invalid && "border-destructive")}>
      <legend className="sr-only">{legend}</legend>
      {groups.map((g, gi) => (
        <div key={g.label ?? gi} className="py-1">
          {g.label && <div className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.label}</div>}
          {g.items.map((it) => {
            const id = `${base}-${it.value}`;
            return (
              <div key={it.value} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-accent">
                <Checkbox id={id} checked={value.includes(it.value)} onCheckedChange={(c) => toggle(it.value, c === true)} />
                <Label htmlFor={id} className="flex-1 cursor-pointer text-sm font-normal">
                  {it.label}
                </Label>
              </div>
            );
          })}
        </div>
      ))}
      {groups.length === 0 && <p className="px-1 py-2 text-sm text-muted-foreground">Nothing to choose from yet.</p>}
    </fieldset>
  );
}

/** Multi-select of active, reviewed departments, grouped by faculty (heads of department). */
export function DepartmentMultiSelect({ value, onChange, invalid }: { value: readonly string[]; onChange(v: string[]): void; invalid?: boolean }) {
  const { data, departments } = useAcademics();
  const groups = usableGroups(data).map((g) => ({ label: g.faculty.name, items: g.departments.map((d) => ({ value: d.code, label: d.name })) }));
  const offered = new Set(groups.flatMap((g) => g.items.map((i) => i.value)));
  const stray = value.filter((v) => !offered.has(v));
  if (stray.length) groups.unshift({ label: "No longer available", items: stray.map((c) => ({ value: c, label: departmentLabel(c, departments) })) });
  return <CheckList legend="Departments" groups={groups} value={value} onChange={onChange} invalid={invalid} />;
}

/** Multi-select of active faculties (deans). */
export function FacultyMultiSelect({ value, onChange, invalid }: { value: readonly string[]; onChange(v: string[]): void; invalid?: boolean }) {
  const { data } = useFaculties();
  const items = (data ?? []).filter((f) => f.active || value.includes(f.code)).map((f) => ({ value: f.code, label: f.active ? f.name : `${f.name} (inactive)` }));
  return <CheckList legend="Faculties" groups={[{ label: null, items }]} value={value} onChange={onChange} invalid={invalid} />;
}

/** Names for an admin's scope (header, profile, user detail). Codes until the list loads. */
export function useScopeNames(departmentCodes: readonly string[], facultyCodes: readonly string[]) {
  const { departments, faculties } = useAcademics();
  return {
    departments: departmentCodes.map((c) => departmentLabel(c, departments)),
    faculties: facultyCodes.map((c) => faculties.get(c)?.name ?? c),
  };
}

/** Faculty + department filters for lists and reports, limited to what the admin can see. */
export function AcademicFilters({
  faculty,
  department,
  onChange,
  me,
}: {
  faculty: string;
  department: string;
  onChange(patch: { faculty?: string; department?: string }): void;
  me: { departmentScoped: boolean; departments: string[]; faculties: string[]; role: string };
}) {
  const facultyId = useId();
  const departmentId = useId();
  const { faculties } = useAcademics();
  const hod = me.departmentScoped && me.role !== "DEAN";
  const inFaculty = faculty ? (faculties.get(faculty)?.departments.map((d) => d.code) ?? []) : null;
  const scope = me.departmentScoped ? me.departments : null;
  const limitTo = inFaculty && scope ? inFaculty.filter((c) => scope.includes(c)) : (inFaculty ?? scope ?? undefined);
  return (
    <>
      {!hod && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={facultyId} className="text-xs text-muted-foreground">
            Faculty
          </Label>
          <FacultySelect
            id={facultyId}
            anyLabel="All faculties"
            includeInactive
            limitTo={me.departmentScoped ? me.faculties : undefined}
            value={faculty}
            // a department outside the new faculty would match nothing: clear it
            onChange={(f) => onChange({ faculty: f, department: "" })}
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor={departmentId} className="text-xs text-muted-foreground">
          Department
        </Label>
        <DepartmentSelect id={departmentId} anyLabel="All departments" limitTo={limitTo} value={department} onChange={(d) => onChange({ department: d })} />
      </div>
    </>
  );
}
