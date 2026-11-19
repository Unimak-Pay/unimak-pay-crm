import createClient from "openapi-fetch";
import { ApiError, toApiError } from "./errors";
import type { paths } from "./schema.gen";

/** All admin API calls go through our proxy (the backend has no CORS). */
export const API_BASE = "/api/unimak";

export type TokenSource = {
  /** Current access token, or null when signed out. */
  getToken(): Promise<string | null>;
  /** Force a refresh; resolves to the new token or null. */
  refresh(): Promise<string | null>;
};

type ApiEvent = { type: "mfa_required" } | { type: "unauthenticated" };
const listeners = new Set<(e: ApiEvent) => void>();

/** The auth layer subscribes to route MFA_REQUIRED / dead sessions to the right screen. */
export function onApiEvent(fn: (e: ApiEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(e: ApiEvent) {
  for (const fn of listeners) fn(e);
}

let tokens: TokenSource = { getToken: async () => null, refresh: async () => null };
export function setTokenSource(t: TokenSource) {
  tokens = t;
}

/** Adds the bearer token; on 401 refreshes the session once and retries. */
export async function authFetch(input: Request): Promise<Response> {
  const retry = input.clone();
  const token = await tokens.getToken();
  if (token) input.headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(input);
  if (res.status !== 401) return res;

  const fresh = await tokens.refresh();
  if (!fresh) {
    emit({ type: "unauthenticated" });
    return res;
  }
  retry.headers.set("authorization", `Bearer ${fresh}`);
  const second = await fetch(retry);
  if (second.status === 401) emit({ type: "unauthenticated" });
  return second;
}

export const api = createClient<paths>({
  baseUrl: API_BASE,
  fetch: (req: Request) => authFetch(req),
});

/**
 * Unwraps an openapi-fetch result: returns `data`, or throws an ApiError built from either
 * error shape. Use inside TanStack Query fns so errors land in one place.
 */
export async function call<T>(
  p: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<NonNullable<T>> {
  let r: { data?: T; error?: unknown; response: Response };
  try {
    r = await p;
  } catch (e) {
    throw new ApiError({
      status: 0,
      code: "NETWORK",
      message: e instanceof Error && e.name === "AbortError" ? "Request cancelled" : "Network error. Check your connection.",
    });
  }
  if (r.error !== undefined || !r.response.ok) {
    const err = toApiError(r.response.status, r.error);
    if (err.code === "MFA_REQUIRED") emit({ type: "mfa_required" });
    throw err;
  }
  return r.data as NonNullable<T>;
}

/** Same auth + error handling for raw downloads (CSV export). */
export async function download(path: string, query: Record<string, string | undefined>): Promise<{ blob: Blob; filename: string }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) qs.set(k, v);
  const res = await authFetch(new Request(`${API_BASE}${path}${qs.size ? `?${qs}` : ""}`));
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const err = toApiError(res.status, body);
    if (err.code === "MFA_REQUIRED") emit({ type: "mfa_required" });
    throw err;
  }
  const cd = res.headers.get("content-disposition") ?? "";
  const filename = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? "export.csv";
  return { blob: await res.blob(), filename };
}
