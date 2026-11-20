import type { components } from "@/api/schema.gen";

type Rule = components["schemas"]["InstalmentRule"];

export const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export const levelLabel = (level: number | null) => (level === null ? "All levels" : `Level ${level}`);

/**
 * Grouped by department (by name), the all-levels rule first, then levels in order.
 * `nameOf` maps a department code to what the user reads.
 */
export function groupInstalmentRules(rules: readonly Rule[], nameOf: (code: string) => string): { department: string; rules: Rule[] }[] {
  const groups = new Map<string, Rule[]>();
  for (const r of rules) groups.set(r.department, [...(groups.get(r.department) ?? []), r]);
  return [...groups]
    .map(([department, rs]) => ({ department, rules: rs.sort((a, b) => (a.level ?? 0) - (b.level ?? 0)) }))
    .sort((a, b) => nameOf(a.department).localeCompare(nameOf(b.department)));
}
