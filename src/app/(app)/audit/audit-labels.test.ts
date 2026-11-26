import { expect, it } from "vitest";
import { auditLabel, auditSummary } from "./audit-labels";

it("labels an unpaid payment's removal with its ref, amount and reason", () => {
  expect(auditLabel("payment.delete_awaiting")).toBe("Unpaid payment removed");
  expect(auditSummary({ action: "payment.delete_awaiting", before: { paymentRef: "15999001", amount: "450000" }, after: { reason: "retention" } })).toBe(
    "Payment 15999001, SLE 4,500.00 removed: nobody paid it within 7 days",
  );
  expect(
    auditSummary({ action: "payment.delete_awaiting", before: { paymentRef: "15999002", amount: "150000" }, after: { reason: "another payment for this fee completed (30000123)" } }),
  ).toBe("Payment 15999002, SLE 1,500.00 removed: another payment for this fee completed (30000123)");
});

it("copes with a missing before/after, and leaves other actions alone", () => {
  expect(auditSummary({ action: "payment.delete_awaiting", before: null, after: null })).toBe("A payment removed");
  expect(auditLabel("fee.update")).toBeNull();
  expect(auditSummary({ action: "fee.update" })).toBeNull();
});
