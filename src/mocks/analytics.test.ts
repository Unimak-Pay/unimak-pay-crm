import { describe, expect, it } from "vitest";
import type { components } from "@/api/schema.gen";
import { collectionRate, createAnalytics, maskEmail, maskPhone, parseFilters } from "./analytics";
import { createDb } from "./db";

type Principal = components["schemas"]["AdminPrincipal"];
const admin = { departmentScoped: false, departments: [] } as unknown as Principal;
const hod = { departmentScoped: true, departments: ["COMPUTING"] } as unknown as Principal;
const db = createDb();
const a = createAnalytics(() => db, () => "2026-11-21T12:00:00.000Z");
const f = (qs = "") => {
  const r = parseFilters(new URL(`http://x/?${qs}`));
  if (Array.isArray(r)) throw new Error(r.join("; "));
  return r;
};

describe("mock outstanding report (mirrors the backend)", () => {
  it("totals add up from the grid, and paid + part-paid + unpaid = students", () => {
    const r = a.outstanding(f(), admin);
    const sum = (k: "billed" | "collected" | "outstanding") => r.grid.reduce((s, c) => s + BigInt(c[k]), 0n).toString();
    expect(r.totals.billed).toBe(sum("billed"));
    expect(r.totals.outstanding).toBe(sum("outstanding"));
    expect(r.totals.paid + r.totals.partPaid + r.totals.unpaid).toBe(r.totals.students);
    expect(r.roster.withoutObligations).toBe(3);
    expect(r.totals.overdue).toBeGreaterThan(0);
  });

  it("inactive students only count with includeInactive", () => {
    expect(a.outstanding(f("includeInactive=true"), admin).totals.students).toBe(a.outstanding(f(), admin).totals.students + 5);
  });

  it("a head of department only sees their departments", () => {
    const r = a.outstanding(f(), hod);
    expect(new Set(r.grid.map((c) => c.department))).toEqual(new Set(["COMPUTING"]));
    expect(r.filters.departments).toEqual(["COMPUTING"]);
  });

  it("rejects bad filters like the DTOs", () => {
    expect(parseFilters(new URL("http://x/?level=0&standing=LATE"))).toHaveLength(2);
  });
});

describe("mock payer list", () => {
  it("the list behind a cell has as many students as the cell", () => {
    const cell = a.outstanding(f(), admin).grid.find((c) => c.department === "COMPUTING" && c.level === 3)!;
    const page = a.list(f("kind=STUDENT&department=COMPUTING&level=3"), admin, new URL("http://x/?limit=200"));
    if (typeof page === "string") throw new Error(page);
    expect(page.items).toHaveLength(cell.students);
    expect(page.items.filter((p) => p.standing === "PAID")).toHaveLength(cell.paid);
  });

  it("pages keep the sort; a cursor from another sort is refused", () => {
    const first = a.list(f("sort=name"), admin, new URL("http://x/?limit=10"));
    if (typeof first === "string") throw new Error(first);
    const names = first.items.map((p) => p.fullName);
    expect([...names].sort()).toEqual(names);
    const next = a.list(f("sort=name"), admin, new URL(`http://x/?limit=10&cursor=${first.nextCursor}`));
    if (typeof next === "string") throw new Error(next);
    expect(next.items[0].fullName >= names.at(-1)!).toBe(true);
    expect(a.list(f("sort=ref"), admin, new URL(`http://x/?limit=10&cursor=${first.nextCursor}`))).toMatch(/same sort/);
  });

  it("masks phones in the list", () => {
    expect(maskPhone("+23276123456")).toBe("+232*****456");
    expect(maskEmail(" Aminata.Kamara@Gmail.com ")).toBe("a***@gmail.com");
    expect(maskEmail("not-an-email")).toBeNull();
    const page = a.list(f(), admin, new URL("http://x/?limit=200"));
    if (typeof page === "string") throw new Error(page);
    expect(page.items.some((p) => p.maskedEmail === null)).toBe(true);
    expect(page.items.filter((p) => p.maskedEmail).every((p) => /^[a-z]\*\*\*@gmail\.com$/.test(p.maskedEmail!))).toBe(true);
    expect(collectionRate(0n, 0n)).toBeNull();
  });
});
