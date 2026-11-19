/**
 * Idempotency for one payout submission. A key is minted when the form opens and reused for
 * every retry of the same reviewed payout. It is replaced only when the server definitively
 * refused the request (4xx other than 409 IDEMPOTENCY_CONFLICT), so a changed payout never
 * reuses a key, and an attempt that may have reached Monime (network error, 5xx, 503) can
 * only be retried unchanged.
 */
import { isApiError } from "@/api/errors";

export type SubmissionOutcome = "definitive" | "uncertain";

/** Did this failure possibly create a payout? */
export function classifyFailure(e: unknown): SubmissionOutcome {
  if (!isApiError(e)) return "uncertain";
  if (e.status === 0 || e.status >= 500) return "uncertain"; // network, timeout, Monime/backend down
  if (e.code === "IDEMPOTENCY_CONFLICT") return "uncertain"; // the key already belongs to a payout
  return "definitive"; // validation, permission, insufficient balance…: nothing was created
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
