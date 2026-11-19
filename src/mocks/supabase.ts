/**
 * Just enough of Supabase Auth (GoTrue) for supabase-js to sign in, refresh, and run TOTP
 * MFA against MSW. Personas: see PERSONAS in db.ts. Any password works except "wrong";
 * the TOTP code is always 123456. Unknown emails sign in but are not admins.
 */
import { http, HttpResponse } from "msw";
import { PERSONAS, type PersonaEmail } from "./db";

export const MOCK_TOTP_CODE = "123456";
const ENROLLED_KEY = "mock:mfa-enrolled";

function b64url(s: string) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string) {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}

export type MockClaims = { sub: string; email: string; aal: "aal1" | "aal2"; exp: number };

export function decodeMockJwt(token: string | null | undefined): MockClaims | null {
  try {
    const [, payload] = (token ?? "").split(".");
    return JSON.parse(fromB64url(payload)) as MockClaims;
  } catch {
    return null;
  }
}

function enrolled(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(ENROLLED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function setEnrolled(email: string) {
  const s = enrolled();
  s.add(email);
  sessionStorage.setItem(ENROLLED_KEY, JSON.stringify([...s]));
}
function hasFactor(email: string) {
  return (PERSONAS[email as PersonaEmail]?.mfaEnrolled ?? false) || enrolled().has(email);
}

const userId = (email: string) => `11111111-1111-4111-8111-${b64url(email).replace(/[^a-z0-9]/gi, "").toLowerCase().padEnd(12, "0").slice(0, 12)}`;
const factorId = (email: string) => `22222222-2222-4222-8222-${userId(email).slice(-12)}`;

function user(email: string) {
  return {
    id: userId(email),
    aud: "authenticated",
    role: "authenticated",
    email,
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
    factors: hasFactor(email)
      ? [{ id: factorId(email), factor_type: "totp", status: "verified", friendly_name: "", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }]
      : [],
  };
}

function session(email: string, aal: "aal1" | "aal2") {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const claims = { sub: userId(email), email, aal, exp, role: "authenticated", aud: "authenticated", amr: [{ method: aal === "aal2" ? "totp" : "password", timestamp: exp - 3600 }] };
  const access_token = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}.mock-signature`;
  return {
    access_token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: `rt.${b64url(JSON.stringify({ email, aal }))}`,
    user: user(email),
  };
}

function bearerEmail(req: Request): MockClaims | null {
  return decodeMockJwt(req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
}

const QR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" width="180" height="180"><rect width="21" height="21" fill="#fff"/><path d="M1 1h7v7H1zM13 1h7v7h-7zM1 13h7v7H1z" fill="none" stroke="#000"/><path d="M3 3h3v3H3zM15 3h3v3h-3zM3 15h3v3H3zM10 10h2v2h-2zM14 14h2v2h-2zM17 11h2v2h-2zM11 16h2v3h-2z" fill="#000"/></svg>';

export function supabaseHandlers(baseUrl: string) {
  const u = (p: string) => `${baseUrl.replace(/\/$/, "")}/auth/v1${p}`;
  return [
    http.post(u("/token"), async ({ request }) => {
      const grant = new URL(request.url).searchParams.get("grant_type");
      const body = (await request.json()) as Record<string, string>;
      if (grant === "password") {
        if (body.password === "wrong" || !body.email) {
          return HttpResponse.json({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, { status: 400 });
        }
        return HttpResponse.json(session(body.email.toLowerCase(), "aal1"));
      }
      if (grant === "refresh_token") {
        try {
          const { email, aal } = JSON.parse(fromB64url(body.refresh_token.slice(3))) as { email: string; aal: "aal1" | "aal2" };
          return HttpResponse.json(session(email, aal));
        } catch {
          return HttpResponse.json({ code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" }, { status: 400 });
        }
      }
      return HttpResponse.json({ msg: "unsupported grant" }, { status: 400 });
    }),
    http.get(u("/user"), ({ request }) => {
      const c = bearerEmail(request);
      if (!c) return HttpResponse.json({ code: 401, msg: "invalid JWT" }, { status: 401 });
      return HttpResponse.json(user(c.email));
    }),
    http.post(u("/logout"), () => new HttpResponse(null, { status: 204 })),
    http.post(u("/factors"), ({ request }) => {
      const c = bearerEmail(request);
      if (!c) return HttpResponse.json({ msg: "invalid JWT" }, { status: 401 });
      return HttpResponse.json({
        id: factorId(c.email),
        type: "totp",
        friendly_name: "",
        totp: { qr_code: QR_SVG, secret: "JBSWY3DPEHPK3PXP", uri: `otpauth://totp/UNIMAK%20Pay:${encodeURIComponent(c.email)}?secret=JBSWY3DPEHPK3PXP&issuer=UNIMAK%20Pay` },
      });
    }),
    http.delete(u("/factors/:id"), () => HttpResponse.json({ id: "deleted" })),
    http.post(u("/factors/:id/challenge"), () =>
      HttpResponse.json({ id: "33333333-3333-4333-8333-333333333333", type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 }),
    ),
    http.post(u("/factors/:id/verify"), async ({ request }) => {
      const c = bearerEmail(request);
      const body = (await request.json()) as { code?: string };
      if (!c) return HttpResponse.json({ msg: "invalid JWT" }, { status: 401 });
      if (body.code !== MOCK_TOTP_CODE) {
        return HttpResponse.json({ code: 422, error_code: "mfa_verification_failed", msg: "Invalid TOTP code entered" }, { status: 422 });
      }
      setEnrolled(c.email);
      return HttpResponse.json(session(c.email, "aal2"));
    }),
  ];
}
