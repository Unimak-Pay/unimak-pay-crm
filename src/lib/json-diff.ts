/** Field-level diff of two JSON values, flattened to dot paths. */
export type DiffRow = { path: string; kind: "added" | "removed" | "changed"; before?: unknown; after?: unknown };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function flatten(v: unknown, prefix: string, out: Map<string, unknown>, depth: number) {
  if (isPlainObject(v) && depth < 6 && Object.keys(v).length) {
    for (const [k, x] of Object.entries(v)) flatten(x, prefix ? `${prefix}.${k}` : k, out, depth + 1);
  } else {
    // arrays and leaves compare as a whole
    out.set(prefix || "(value)", v);
  }
}

export function jsonDiff(before: unknown, after: unknown): DiffRow[] {
  const a = new Map<string, unknown>();
  const b = new Map<string, unknown>();
  if (before !== null && before !== undefined) flatten(before, "", a, 0);
  if (after !== null && after !== undefined) flatten(after, "", b, 0);
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  const rows: DiffRow[] = [];
  for (const p of paths) {
    const inA = a.has(p);
    const inB = b.has(p);
    if (inA && !inB) rows.push({ path: p, kind: "removed", before: a.get(p) });
    else if (!inA && inB) rows.push({ path: p, kind: "added", after: b.get(p) });
    else if (JSON.stringify(a.get(p)) !== JSON.stringify(b.get(p))) rows.push({ path: p, kind: "changed", before: a.get(p), after: b.get(p) });
  }
  return rows;
}
