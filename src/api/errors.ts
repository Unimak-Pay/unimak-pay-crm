/**
 * One error type for everything the admin API (or our proxy) can return.
 * Two wire shapes:
 *   business:   { error: { code, message, details } }
 *   validation: { statusCode, message: string | string[], error }
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;
  /** Validation messages, one per field problem. */
  readonly messages: string[];

  constructor(init: { status: number; code: string; message: string; details?: Record<string, unknown>; messages?: string[] }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? {};
    this.messages = init.messages ?? [init.message];
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const STATUS_CODES: Record<number, string> = {
  400: "VALIDATION",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE",
  429: "RATE_LIMITED",
  503: "UPSTREAM_UNAVAILABLE",
};

export function toApiError(status: number, body: unknown): ApiError {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.code === "string") {
    const e = body.error;
    return new ApiError({
      status,
      code: e.code as string,
      message: typeof e.message === "string" ? e.message : String(e.code),
      details: isRecord(e.details) ? e.details : {},
    });
  }
  if (isRecord(body) && "message" in body && (typeof body.message === "string" || Array.isArray(body.message))) {
    const messages = (Array.isArray(body.message) ? body.message : [body.message]).map(String);
    return new ApiError({
      status,
      code: STATUS_CODES[status] ?? (status >= 500 ? "SERVER_ERROR" : "HTTP_ERROR"),
      message: messages.join("; "),
      messages,
    });
  }
  return new ApiError({
    status,
    code: STATUS_CODES[status] ?? (status >= 500 ? "SERVER_ERROR" : "HTTP_ERROR"),
    message: status >= 500 ? "Something went wrong on the server. Try again." : `Request failed (${status})`,
  });
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** What to show a person for an error. */
export function errorMessage(e: unknown): string {
  if (!isApiError(e)) return e instanceof Error ? e.message : "Something went wrong";
  switch (e.code) {
    case "UPSTREAM_UNAVAILABLE":
      return "Monime is unavailable, try again.";
    case "MFA_REQUIRED":
      return "Two-factor authentication is required. Enter your authenticator code.";
    case "RATE_LIMITED":
      return "Too many requests. Wait a moment and try again.";
    default:
      return e.message;
  }
}

/** `/v1/admin/me` answered FORBIDDEN: signed in to Supabase, but not an (active) invited admin. */
export function isNotAnAdmin(e: unknown): boolean {
  return isApiError(e) && e.status === 403 && e.code === "FORBIDDEN";
}
