import type { components } from "@/api/schema.gen";
import { formatSleSigned } from "@/lib/money";

export type RepriceReport = components["schemas"]["RepriceReport"];
export type SkipReason = RepriceReport["skipped"][number]["reason"];

/** Why an obligation was left alone, in words a bursar can act on. */
export const SKIP_REASONS: Record<SkipReason, string> = {
  PAID: "Paid in full",
  HAS_PAYMENTS: "Part paid: decide manually",
  PAYMENT_IN_PROGRESS: "Payment in progress: try again in 15 minutes",
  NOT_ELIGIBLE: "No longer eligible",
  NO_RATE_RULE: "No rate rule matches",
  AMBIGUOUS_RATE_RULE: "Rules are tied",
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The confirm text: what Apply writes. */
export function applyConfirmText(r: RepriceReport): string {
  return `This adds ledger adjustments for ${plural(r.changes.length, "payer")}, total ${formatSleSigned(r.totals.difference)}.`;
}
