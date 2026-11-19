/**
 * Server-side proxy to the UNIMAK Pay backend (which sends no CORS headers).
 * The browser calls /api/unimak/v1/admin/...; we forward to UNIMAK_API_URL.
 *
 * - only /v1/admin/** paths, no dot segments or encoded slashes
 * - forwards method, query, body and the caller's Authorization header; nothing else
 *   (no cookies: the Supabase session cookie stays here)
 * - streams the response back; never logs headers or bodies
 * - refuses writes to the production backend unless this is the production deployment
 */

export const PRODUCTION_API_HOSTS = ["unimak-pay-backend.vercel.app"];
const FORWARD_REQUEST_HEADERS = ["authorization", "content-type", "accept"];
const FORWARD_RESPONSE_HEADERS = ["content-type", "content-disposition", "content-length", "retry-after"];
const MAX_BODY_BYTES = 1_000_000;
const TIMEOUT_MS = 60_000; // a manual reconciliation run can take a while

export type ProxyEnv = {
  UNIMAK_API_URL?: string;
  ALLOW_PROD_WRITES?: string;
  VERCEL_ENV?: string;
};

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, details: {} } }, { status, headers: { "cache-control": "no-store" } });
}

/** Validates the catch-all segments and returns the upstream path, or null. */
export function upstreamPath(segments: readonly string[]): string | null {
  if (segments.length < 3 || segments[0] !== "v1" || segments[1] !== "admin") return null;
  for (const s of segments) {
    if (s === "" || s === "." || s === ".." || s.includes("/") || s.includes("\\")) return null;
  }
  return "/" + segments.map(encodeURIComponent).join("/");
}

export function writesAllowed(target: URL, env: ProxyEnv): boolean {
  if (!PRODUCTION_API_HOSTS.includes(target.hostname)) return true;
  return env.VERCEL_ENV === "production" || env.ALLOW_PROD_WRITES === "true";
}

export async function proxyToUnimak(
  req: Request,
  segments: readonly string[],
  env: ProxyEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const method = req.method.toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return errorResponse(405, "METHOD_NOT_ALLOWED", `${method} is not allowed`);
  }

  const path = upstreamPath(segments);
  if (!path) return errorResponse(404, "NOT_FOUND", "Only /v1/admin/ routes are available");

  if (!env.UNIMAK_API_URL) return errorResponse(500, "PROXY_MISCONFIGURED", "UNIMAK_API_URL is not set");
  let base: URL;
  try {
    base = new URL(env.UNIMAK_API_URL);
  } catch {
    return errorResponse(500, "PROXY_MISCONFIGURED", "UNIMAK_API_URL is not a valid URL");
  }
  const target = new URL(path, base);
  target.search = new URL(req.url).search;

  if (method !== "GET" && !writesAllowed(target, env)) {
    return errorResponse(
      403,
      "PROD_WRITE_BLOCKED",
      "This deployment may not change data on the production backend. Point UNIMAK_API_URL at a local or mock backend.",
    );
  }

  const headers = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }

  let body: ArrayBuffer | undefined;
  if (method !== "GET") {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) return errorResponse(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return errorResponse(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
    if (body.byteLength === 0) body = undefined;
  }

  let upstream: Response;
  try {
    upstream = await fetchImpl(target, {
      method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    return errorResponse(
      timedOut ? 504 : 502,
      "BACKEND_UNAVAILABLE",
      timedOut ? "The UNIMAK Pay backend took too long to answer" : "The UNIMAK Pay backend is unreachable",
    );
  }

  const out = new Headers({ "cache-control": "no-store" });
  for (const h of FORWARD_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}
