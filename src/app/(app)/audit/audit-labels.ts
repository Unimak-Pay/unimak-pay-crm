import { formatSle } from "@/lib/money";

type Entry = { action: string; before?: unknown; after?: unknown };

const LABELS: Record<string, string> = {
  "payment.delete_awaiting": "Unpaid payment removed",
  "clearance_policy.update": "Exam clearance rule changed",
};

const REASONS: Record<string, string> = {
  retention: "nobody paid it within 7 days",
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** A readable action name; unknown actions keep their code. */
export function auditLabel(action: string): string | null {
  return LABELS[action] ?? null;
}

/**
 * One line saying what happened, for actions where the JSON alone is hard to read.
 * payment.delete_awaiting: the ref and amount from `before`, the reason from `after.reason`.
 */
export function auditSummary(e: Entry): string | null {
  if (e.action === "payment.delete_awaiting") {
    const b = obj(e.before);
    const ref = str(b.paymentRef);
    const amount = str(b.amount);
    const reason = str(obj(e.after).reason);
    const what = [ref && `Payment ${ref}`, amount && /^-?\d+$/.test(amount) ? formatSle(amount) : null].filter(Boolean).join(", ");
    const why = reason ? (REASONS[reason] ?? reason) : null;
    return [what || "A payment", why ? `removed: ${why}` : "removed"].join(" ");
  }
  return null;
}
