import { describe, expect, it } from "vitest";
import { applyConfirmText, type RepriceReport, SKIP_REASONS } from "./reprice-text";

const payer = { kind: "student" as const, ref: "UNI-2025-0001", fullName: "Abdul Koroma" };
const report = (differences: string[], total: string): RepriceReport => ({
  fee: { id: "f", name: "Tuition 2026/27" },
  applied: false,
  changes: differences.map((d, i) => ({ obligationId: String(i), payer, current: "450000", proposed: "0", difference: d, rateRuleId: "r" })),
  skipped: [],
  unchanged: 0,
  totals: { obligations: differences.length, changed: differences.length, difference: total },
});

describe("applyConfirmText", () => {
  it("names the payer count and the signed total in SLE", () => {
    expect(applyConfirmText(report(["25000", "25000"], "50000"))).toBe("This adds ledger adjustments for 2 payers, total +SLE 500.00.");
  });
  it("handles one payer and a negative total", () => {
    expect(applyConfirmText(report(["-12550"], "-12550"))).toBe("This adds ledger adjustments for 1 payer, total -SLE 125.50.");
  });
});

describe("SKIP_REASONS", () => {
  it("has readable text for every reason in the spec", () => {
    expect(Object.keys(SKIP_REASONS).sort()).toEqual(["AMBIGUOUS_RATE_RULE", "HAS_PAYMENTS", "NOT_ELIGIBLE", "NO_RATE_RULE", "PAID", "PAYMENT_IN_PROGRESS"]);
    expect(SKIP_REASONS.PAYMENT_IN_PROGRESS).toMatch(/15 minutes/);
  });
});
