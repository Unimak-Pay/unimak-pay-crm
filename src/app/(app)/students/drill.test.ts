import { describe, expect, it } from "vitest";
import { cellHref, formatRate, listQuery, listSort, notBilledHref, rateBin, reportQuery, type ReportValues } from "./drill";

const empty: ReportValues = { feeId: "", feeType: "", period: "", faculty: "", department: "", level: "", includeInactive: "" };
const params = (href: string) => Object.fromEntries(new URL(href, "http://x").searchParams);

describe("reportQuery / listQuery", () => {
  it("types the URL values and drops junk instead of sending it", () => {
    expect(reportQuery({ ...empty, level: "3", includeInactive: "true", feeType: "TUITION" })).toEqual({ level: 3, includeInactive: true, feeType: "TUITION" });
    expect(reportQuery({ ...empty, level: "11", includeInactive: "yes" })).toEqual({});
    expect(reportQuery({ ...empty, level: "2.5" })).toEqual({});
    expect(listQuery({ ...empty, kind: "STUDENT", enrolmentStatus: "NOPE", standing: "OVERDUE", q: "  kam ", sort: "" })).toEqual({
      kind: "STUDENT",
      standing: "OVERDUE",
      q: "kam",
    });
  });

  it("defaults the sort to highest balance first", () => {
    expect(listSort("")).toBe("-balance");
    expect(listSort("name")).toBe("name");
    expect(listSort("-name")).toBe("-balance");
  });
});

describe("drill links", () => {
  const values: ReportValues = { ...empty, feeType: "TUITION", period: "2026/27", faculty: "FAC-SCI-TECH", includeInactive: "true" };

  it("a cell keeps the report's filters and adds its department and level", () => {
    expect(params(cellHref(values, { department: "COMPUTING", level: 2 }))).toEqual({
      kind: "STUDENT",
      feeType: "TUITION",
      period: "2026/27",
      faculty: "FAC-SCI-TECH",
      department: "COMPUTING",
      level: "2",
      includeInactive: "true",
    });
  });

  it("a count adds its standing", () => {
    expect(params(cellHref(values, { department: "COMPUTING", level: 2 }, "OVERDUE")).standing).toBe("OVERDUE");
  });

  it("the not-billed warning keeps academic filters but no fee filter (the list would then hide them)", () => {
    expect(params(notBilledHref({ ...values, level: "3" }))).toEqual({ kind: "STUDENT", faculty: "FAC-SCI-TECH", level: "3", standing: "NOT_BILLED" });
  });
});

describe("rateBin", () => {
  it("five 20% bins; null when nothing was billed", () => {
    expect([0, 0.194, 0.2, 0.5, 0.794, 0.8, 1].map(rateBin)).toEqual([0, 0, 1, 2, 3, 4, 4]);
    // the colour agrees with the rounded percent the cell shows
    expect(formatRate(0.597)).toBe("60%");
    expect(rateBin(0.597)).toBe(3);
    expect(rateBin(null)).toBeNull();
    expect(formatRate(0.617)).toBe("62%");
    expect(formatRate(null)).toBe("—");
  });
});
