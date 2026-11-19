/**
 * MSW handlers for the admin API, built from openapi.yaml operation ids. Every handler
 * checks auth the way the backend does: Bearer JWT → invited admin → 2FA for super admin /
 * bursar → the operation's `x-permission`. State is in memory (reset on reload).
 */
import { delay, http, HttpResponse } from "msw";
import { OPERATIONS, type OperationId, type Permission } from "@/api/permissions.gen";
import type { components } from "@/api/schema.gen";
import { createDb, mockNow, ROLE_PERMISSIONS, uuid, type Db } from "./db";
import { decodeMockJwt } from "./supabase";

type S = components["schemas"];
type Principal = S["AdminPrincipal"];

let db: Db = createDb();
export function resetMockDb() {
  db = createDb();
}

const MFA_ROLES: S["AdminRole"][] = ["SUPER_ADMIN", "BURSAR"];
const now = () => new Date(Math.max(Date.now(), mockNow())).toISOString();

function fail(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}
function invalid(...messages: string[]) {
  return HttpResponse.json({ statusCode: 400, message: messages, error: "Bad Request" }, { status: 400 });
}

function authenticate(request: Request): Principal | Response {
  const claims = decodeMockJwt(request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
  if (!claims) return fail(401, "UNAUTHENTICATED", "Missing bearer token");
  if (claims.exp * 1000 < Date.now()) return fail(401, "UNAUTHENTICATED", "Invalid token: expired");
  const user = db.users.find((u) => u.email === claims.email);
  if (!user || !user.active) return fail(403, "FORBIDDEN", "Not an active UNIMAK admin");
  if (!user.authUserId) user.authUserId = claims.sub;
  if (MFA_ROLES.includes(user.role) && claims.aal !== "aal2") {
    return fail(403, "MFA_REQUIRED", "Two-factor authentication is required for this role");
  }
  const scoped = user.role === "HEAD_OF_DEPARTMENT";
  const perms = new Set<Permission>([...ROLE_PERMISSIONS[user.role], ...(user.extraPermissions as Permission[])]);
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    permissions: [...perms],
    departments: scoped ? user.departments : [],
    departmentScoped: scoped,
    aal: claims.aal,
  };
}

type Ctx = { request: Request; params: Record<string, string>; url: URL; me: Principal };

function route(id: OperationId, resolver: (ctx: Ctx) => Response | Promise<Response>) {
  const o = OPERATIONS[id];
  const path = "/api/unimak" + o.path.replace(/\{(\w+)\}/g, ":$1");
  return http[o.method](path, async ({ request, params }) => {
    await delay(120);
    const me = authenticate(request);
    if (me instanceof Response) return me;
    if (o.permission && !me.permissions.includes(o.permission)) {
      return fail(403, "FORBIDDEN", `Missing permission ${o.permission}`);
    }
    return resolver({ request, params: params as Record<string, string>, url: new URL(request.url), me });
  });
}

function page<T extends { id: string }>(rows: T[], url: URL) {
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const cursor = url.searchParams.get("cursor");
  const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
  const items = rows.slice(start, start + limit);
  return HttpResponse.json({ items, nextCursor: start + limit < rows.length ? (items.at(-1)?.id ?? null) : null });
}

function sorted<T extends { id: string; createdAt: string; amount: string }>(rows: T[], url: URL): T[] {
  const sort = url.searchParams.get("sort") ?? "-createdAt";
  const desc = sort.startsWith("-");
  const field = sort.replace(/^-/, "");
  return [...rows].sort((a, b) => {
    const c =
      field === "amount"
        ? BigInt(a.amount) < BigInt(b.amount) ? -1 : BigInt(a.amount) > BigInt(b.amount) ? 1 : 0
        : a.createdAt.localeCompare(b.createdAt);
    return (desc ? -c : c) || (desc ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id));
  });
}

function audit(me: Principal, action: string, entity: string, entityId: string, before: unknown, after: unknown) {
  db.audit.unshift({ id: uuid(17), actorId: me.id, action, entity, entityId, before: before ?? null, after: after ?? null, at: now() });
}

function body<T>(request: Request): Promise<T> {
  return request.json().catch(() => ({})) as Promise<T>;
}

/**
 * Invite email outcome by address (mock hooks): "+registered" ALREADY_REGISTERED, "+noconfig"
 * NOT_CONFIGURED, "+fail" FAILED (a re-send then succeeds), anything else SENT.
 */
function inviteOutcome(email: string): S["InviteOutcome"] {
  if (email.includes("+registered")) return { status: "ALREADY_REGISTERED", message: "A user with this email address has already been registered" };
  if (email.includes("+noconfig")) return { status: "NOT_CONFIGURED", message: "SUPABASE_SERVICE_ROLE_KEY is not set on the backend" };
  if (email.includes("+fail")) return { status: "FAILED", message: "Email rate limit exceeded" };
  return { status: "SENT" };
}

// ── payments ──
function filterPayments(url: URL, me: Principal) {
  const q = Object.fromEntries(url.searchParams);
  return db.payments.filter((p) => {
    if (me.departmentScoped && !me.departments.includes(p.payer.department ?? "")) return false;
    if (q.status && p.status !== q.status) return false;
    if (q.channel && p.channel !== q.channel) return false;
    if (q.feeType && p.feeTypeCode !== q.feeType) return false;
    if (q.payerRef && p.payer.ref.toLowerCase() !== q.payerRef.toLowerCase()) return false;
    if (q.ref && ![p.paymentRef, p.monimeOrderNumber, p.monimePaymentId].includes(q.ref.trim())) return false;
    if (q.from && p.createdAt < q.from) return false;
    if (q.to && p.createdAt > q.to) return false;
    return true;
  });
}
function listPayment(p: S["AdminPaymentDetail"]): S["AdminPayment"] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ledgerEntry, commissionTransfer, ...rest } = p;
  return rest;
}

// ── reports ──
function addDay(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
function summary(url: URL, me: Principal) {
  const to = url.searchParams.get("to") ?? new Date(mockNow()).toISOString().slice(0, 10);
  const from = url.searchParams.get("from") ?? addDay(to, -29);
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  if (days < 1 || days > 366) return invalid("The range must be 1 to 366 days");
  const feeType = url.searchParams.get("feeType");
  const channel = url.searchParams.get("channel") as S["Channel"] | null;
  const inScope = db.payments.filter(
    (p) =>
      (!me.departmentScoped || me.departments.includes(p.payer.department ?? "")) &&
      (!feeType || p.feeTypeCode === feeType) &&
      (!channel || p.channel === channel),
  );
  const inRange = (iso: string | null) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const done = inScope.filter((p) => p.status === "COMPLETED" && inRange(p.completedAt));
  const sum = (xs: string[]) => xs.reduce((s, x) => s + BigInt(x), 0n);
  const amount = sum(done.map((p) => p.amount));
  const byDay = Array.from({ length: days }, (_, i) => {
    const d = addDay(from, i);
    const ps = done.filter((p) => p.completedAt!.startsWith(d));
    return { date: d, amount: sum(ps.map((p) => p.amount)).toString(), count: ps.length };
  });
  const groups = new Map<string, typeof done>();
  for (const p of done) groups.set(p.feeTypeCode, [...(groups.get(p.feeTypeCode) ?? []), p]);
  const started = inScope.filter((p) => inRange(p.createdAt));
  const isExpired = (p: (typeof started)[number]) =>
    p.status === "EXPIRED" || ((p.status === "PENDING" || p.status === "INITIATED") && p.expiresAt < now());
  const ca = (ps: typeof started) => ({ count: ps.length, amount: sum(ps.map((p) => p.amount)).toString() });
  const completed = started.filter((p) => p.status === "COMPLETED");
  const showMoney = (perm: Permission) => !me.departmentScoped && me.permissions.includes(perm);
  const tr = db.transfers.filter((t) => inRange(t.createdAt));
  const po = db.payouts.filter((t) => inRange(t.createdAt));
  const caT = (xs: { amount: string }[]) => ({ count: xs.length, amount: sum(xs.map((x) => x.amount)).toString() });
  return HttpResponse.json({
    range: { from, to, days, timezone: "Africa/Freetown (UTC)" },
    filters: { feeType, channel, departments: me.departmentScoped ? me.departments : null },
    collected: {
      amount: amount.toString(),
      count: done.length,
      average: done.length ? (amount / BigInt(done.length)).toString() : "0",
      monimeFees: sum(done.map((p) => p.monimeFee)).toString(),
      platformFees: sum(done.map((p) => p.platformFee)).toString(),
      net: sum(done.map((p) => p.netAmount)).toString(),
      lateSettlements: done.filter((p) => p.completedAt! > p.expiresAt).length,
    },
    byDay,
    byFeeType: [...groups.entries()].map(([code, ps]) => ({
      feeTypeCode: code,
      feeTypeName: db.feeTypes.find((f) => f.code === code)?.name ?? code,
      amount: sum(ps.map((p) => p.amount)).toString(),
      count: ps.length,
      platformFees: sum(ps.map((p) => p.platformFee)).toString(),
      net: sum(ps.map((p) => p.netAmount)).toString(),
    })),
    byChannel: (["USSD", "DOTS"] as const).map((c) => {
      const ps = done.filter((p) => p.channel === c);
      return { channel: c, amount: sum(ps.map((p) => p.amount)).toString(), count: ps.length };
    }),
    payments: {
      started: started.length,
      completed: ca(completed),
      pending: ca(started.filter((p) => (p.status === "PENDING" || p.status === "INITIATED") && !isExpired(p))),
      failed: ca(started.filter((p) => p.status === "FAILED")),
      expired: ca(started.filter(isExpired)),
      completionRate: started.length ? completed.length / started.length : null,
    },
    commission: showMoney("transfers.read")
      ? {
          transferred: caT(tr.filter((t) => t.status === "COMPLETED")),
          inFlight: caT(tr.filter((t) => t.status === "PENDING" || t.status === "SUBMITTED")),
          failed: caT(tr.filter((t) => t.status === "FAILED")),
        }
      : null,
    payouts: showMoney("payouts.read")
      ? {
          paidOut: caT(po.filter((t) => t.status === "COMPLETED")),
          inFlight: caT(po.filter((t) => ["REQUESTED", "SUBMITTED", "PROCESSING"].includes(t.status))),
          failed: caT(po.filter((t) => t.status === "FAILED")),
        }
      : null,
  });
}

// ── fees ──
type Matchers = Pick<S["RateRule"], "programCode" | "department" | "level" | "residency" | "intake">;
const MATCHER_KEYS = ["programCode", "department", "level", "residency", "intake"] as const;
function normMatchers(b: Partial<Matchers>): Matchers {
  return {
    programCode: b.programCode || null,
    department: b.department || null,
    level: b.level ?? null,
    residency: b.residency ?? null,
    intake: b.intake || null,
  };
}
function specificity(m: Matchers) {
  return MATCHER_KEYS.filter((k) => m[k] !== null).length;
}
/** Two rules tie if equally specific, not identical, and some payer can match both. */
function tieWith(m: Matchers, others: Matchers[]): Matchers | null {
  for (const o of others) {
    if (specificity(o) !== specificity(m)) continue;
    const same = MATCHER_KEYS.every((k) => o[k] === m[k]);
    if (same) continue;
    const compatible = MATCHER_KEYS.every((k) => o[k] === null || m[k] === null || o[k] === m[k]);
    if (!compatible) continue;
    const merged = Object.fromEntries(MATCHER_KEYS.map((k) => [k, m[k] ?? o[k]])) as Matchers;
    const tieBreakerExists = others.some((x) => MATCHER_KEYS.every((k) => x[k] === merged[k]));
    if (!tieBreakerExists) return merged;
  }
  return null;
}
function describeMatchers(m: Matchers) {
  return MATCHER_KEYS.filter((k) => m[k] !== null).map((k) => `${k}=${m[k]}`).join(", ") || "everyone";
}
function feeDetail(fee: S["Fee"]): S["FeeDetail"] {
  const ft = db.feeTypes.find((t) => t.id === fee.feeTypeId)!;
  return {
    ...fee,
    feeType: { ...ft, account: db.accounts.find((a) => a.feeTypeId === ft.id) ?? null },
    rateRules: db.rateRules.filter((r) => r.feeId === fee.id),
    eligibilityRules: db.eligibilityRules.filter((r) => r.feeId === fee.id),
    instalmentRules: db.instalmentRules.filter((r) => r.feeId === fee.id),
    _count: { obligations: fee.status === "DRAFT" ? 0 : 140 },
  };
}

function accountItem(a: S["FinancialAccount"]): S["AccountListItem"] {
  return {
    ...a,
    feeTypeCode: db.feeTypes.find((f) => f.id === a.feeTypeId)?.code ?? null,
    unsubmittedPayouts: db.payouts
      .filter((p) => p.financialAccountId === a.id && p.status === "REQUESTED")
      .reduce((s, p) => s + BigInt(p.amount), 0n)
      .toString(),
  };
}

function createAccountFor(ft: S["FeeType"]): S["FinancialAccount"] {
  const a: S["FinancialAccount"] = {
    id: uuid(4), monimeId: `fac-${ft.code.toLowerCase()}${Math.random().toString(36).slice(2, 6)}`,
    reference: `unimak-fee-${ft.code.toLowerCase()}`, name: `UNIMAK ${ft.name}`, purpose: "FEE_TYPE", feeTypeId: ft.id,
    uvan: null, availableBalance: "0", balanceUpdatedAt: now(), createdAt: now(),
  };
  db.accounts.push(a);
  return a;
}

/** Idempotency keys of every POST /payouts, in order (read by e2e via window.__mockPayoutAttempts). */
const mockPayoutAttempts: string[] = [];
if (typeof window !== "undefined") (window as unknown as { __mockPayoutAttempts: string[] }).__mockPayoutAttempts = mockPayoutAttempts;

/** Simulated Monime: submitted payouts complete ~6 s later (shows the polling). */
const payoutSubmittedAt = new Map<string, number>();
function advancePayout(p: S["Payout"]) {
  const t = payoutSubmittedAt.get(p.id);
  if (t && p.status === "SUBMITTED" && Date.now() - t > 3000) p.status = "PROCESSING";
  if (t && p.status === "PROCESSING" && Date.now() - t > 6000) {
    p.status = "COMPLETED";
    p.completedAt = now();
    p.fees = "2500";
    p.updatedAt = now();
  }
}

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const sle = (minor: string) => {
  const v = BigInt(minor);
  return `${v / 100n}.${(v % 100n).toString().padStart(2, "0")}`;
};

export const apiHandlers = [
  route("adminMe", ({ me }) => HttpResponse.json(me)),

  // ── users & audit ──
  route("adminListUsers", () => HttpResponse.json([...db.users].sort((a, b) => a.email.localeCompare(b.email)))),
  route("adminCreateUser", async ({ request, me }) => {
    const b = await body<{ email?: string; name?: string; role?: S["AdminRole"]; extraPermissions?: Permission[]; departments?: string[] }>(request);
    if (!b.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) return invalid("email must be an email");
    if (!b.role || !(b.role in ROLE_PERMISSIONS)) return invalid("role must be one of the following values: SUPER_ADMIN, BURSAR, FINANCE_OFFICER, HEAD_OF_DEPARTMENT, AUDITOR");
    const email = b.email.trim().toLowerCase();
    if (db.users.some((u) => u.email === email)) return fail(409, "CONFLICT", `An admin with email ${email} already exists`);
    const wanted = [...ROLE_PERMISSIONS[b.role], ...(b.extraPermissions ?? [])];
    const missing = wanted.filter((p) => !me.permissions.includes(p));
    if (missing.length) return fail(403, "FORBIDDEN", `You cannot grant permissions you don't have: ${missing.join(", ")}`);
    const u: S["AdminUser"] = {
      id: uuid(1), email, authUserId: null, name: b.name || null, role: b.role, extraPermissions: b.extraPermissions ?? [],
      departments: b.departments ?? [], active: true, lastLoginAt: null, createdBy: me.id, createdAt: now(), updatedAt: now(),
    };
    db.users.push(u);
    audit(me, "user.create", "AdminUser", u.id, null, u);
    return HttpResponse.json({ ...u, invitation: inviteOutcome(email) }, { status: 201 });
  }),
  route("adminResendInvite", ({ params, me }) => {
    const u = db.users.find((x) => x.id === params.id);
    if (!u) return fail(404, "NOT_FOUND", "Admin user not found");
    // e2e hook: race@… "signs in" between the list loading and the re-send
    if (u.email.startsWith("race@") && !u.authUserId) {
      u.authUserId = uuid(2);
      u.lastLoginAt = now();
    }
    if (!u.active) return fail(409, "INVALID_STATE", `${u.email} is deactivated. Reactivate them first.`);
    if (u.authUserId) return fail(409, "INVALID_STATE", `${u.email} has already signed in; there is nothing to re-send.`);
    audit(me, "admin_user.invite", "AdminUser", u.id, null, { email: u.email });
    const outcome = inviteOutcome(u.email);
    return HttpResponse.json({ ...u, invitation: outcome.status === "FAILED" ? { status: "SENT" } : outcome });
  }),
  route("adminGetUser", ({ params }) => {
    const u = db.users.find((x) => x.id === params.id);
    return u ? HttpResponse.json(u) : fail(404, "NOT_FOUND", "Admin user not found");
  }),
  route("adminUpdateUser", async ({ request, params, me }) => {
    const u = db.users.find((x) => x.id === params.id);
    if (!u) return fail(404, "NOT_FOUND", "Admin user not found");
    const b = await body<Partial<S["AdminUser"]>>(request);
    if (b.active === false && u.id === me.id) return fail(409, "INVALID_STATE", "You cannot deactivate yourself");
    const activeSupers = db.users.filter((x) => x.active && x.role === "SUPER_ADMIN");
    if (u.role === "SUPER_ADMIN" && activeSupers.length === 1 && (b.active === false || (b.role && b.role !== "SUPER_ADMIN"))) {
      return fail(409, "INVALID_STATE", "There must always be at least one active super admin");
    }
    if (b.role || b.extraPermissions) {
      const wanted = [...ROLE_PERMISSIONS[b.role ?? u.role], ...((b.extraPermissions ?? u.extraPermissions) as Permission[])];
      const missing = wanted.filter((p) => !me.permissions.includes(p));
      if (missing.length) return fail(403, "FORBIDDEN", `You cannot grant permissions you don't have: ${missing.join(", ")}`);
    }
    const before = { ...u };
    Object.assign(u, {
      ...(b.name !== undefined && { name: b.name || null }),
      ...(b.role && { role: b.role }),
      ...(b.extraPermissions && { extraPermissions: b.extraPermissions }),
      ...(b.departments && { departments: b.departments }),
      ...(b.active !== undefined && { active: b.active }),
      updatedAt: now(),
    });
    audit(me, "user.update", "AdminUser", u.id, before, u);
    return HttpResponse.json(u);
  }),
  route("adminAuditLog", ({ url }) => {
    const q = Object.fromEntries(url.searchParams);
    return page(
      db.audit.filter((a) => (!q.entity || a.entity === q.entity) && (!q.entityId || a.entityId === q.entityId) && (!q.actorId || a.actorId === q.actorId)),
      url,
    );
  }),

  // ── reports ──
  route("adminReportsSummary", ({ url, me }) => summary(url, me)),

  // ── payments (export.csv before /:id) ──
  route("adminExportPayments", ({ url, me }) => {
    const rows = filterPayments(url, me).slice().reverse();
    const cols = [
      "created_at", "completed_at", "payment_ref", "status", "channel", "collection_method", "fee_type", "fee_name", "payer_kind",
      "payer_ref", "payer_name", "program", "department", "amount_sle", "monime_fee_sle", "platform_fee_sle", "net_sle",
      "payer_phone", "monime_order_number", "monime_payment_id", "receipt_number", "failure_reason", "payment_id",
    ];
    const lines = rows.map((p) =>
      [
        p.createdAt, p.completedAt, p.paymentRef, p.status, p.channel, p.collectionMethod, p.feeTypeCode, p.feeName, p.payer.kind,
        p.payer.ref, p.payer.fullName, p.payer.programCode, p.payer.department, sle(p.amount), sle(p.monimeFee), sle(p.platformFee),
        sle(p.netAmount), p.payerPhone, p.monimeOrderNumber, p.monimePaymentId, p.receiptNumber, p.failureReason, p.id,
      ].map(csvCell).join(","),
    );
    return new HttpResponse("﻿" + [cols.join(","), ...lines].join("\n") + "\n", {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="unimak-payments-${now().slice(0, 10)}.csv"` },
    });
  }),
  route("adminListPayments", ({ url, me }) => page(sorted(filterPayments(url, me), url).map(listPayment), url)),
  route("adminGetPayment", ({ params, me }) => {
    const p = db.payments.find((x) => x.id === params.id);
    if (!p || (me.departmentScoped && !me.departments.includes(p.payer.department ?? ""))) return fail(404, "NOT_FOUND", "Payment not found");
    return HttpResponse.json(p);
  }),
  route("adminReconcilePayment", ({ params, me }) => {
    const p = db.payments.find((x) => x.id === params.id);
    if (!p) return fail(404, "NOT_FOUND", "Payment not found");
    const before = p.status;
    if ((p.status === "PENDING" || p.status === "INITIATED") && p.expiresAt < now()) {
      p.status = "EXPIRED";
      p.ussdCode = null;
      p.updatedAt = now();
      audit(me, "payment.reconcile", "Payment", p.id, { status: before }, { status: p.status });
    }
    return HttpResponse.json({ paymentId: p.id, before, after: p.status });
  }),

  // ── fee types ──
  route("adminFeeTypes", () =>
    HttpResponse.json(
      db.feeTypes.map((ft) => ({
        ...ft,
        account: db.accounts.find((a) => a.feeTypeId === ft.id) ?? null,
        _count: { fees: db.fees.filter((f) => f.feeTypeId === ft.id).length },
      })),
    ),
  ),
  route("adminCreateFeeType", async ({ request, me }) => {
    const b = await body<{ code?: string; name?: string; payerKind?: S["PayerKind"]; recurrence?: S["Recurrence"] }>(request);
    const errors: string[] = [];
    if (!b.code || !/^[A-Z][A-Z0-9_]{1,19}$/.test(b.code)) errors.push("code must match /^[A-Z][A-Z0-9_]{1,19}$/");
    if (!b.name || b.name.length < 2) errors.push("name must be longer than or equal to 2 characters");
    if (!b.payerKind) errors.push("payerKind must be one of the following values: APPLICANT, STUDENT");
    if (!b.recurrence) errors.push("recurrence must be one of the following values: ONCE, PER_YEAR");
    if (errors.length) return invalid(...errors);
    if (db.feeTypes.some((f) => f.code === b.code)) return fail(409, "CONFLICT", `Fee type ${b.code} already exists`);
    const ft: S["FeeType"] = { id: uuid(3), code: b.code!, name: b.name!, payerKind: b.payerKind!, recurrence: b.recurrence!, createdAt: now() };
    db.feeTypes.push(ft);
    // "…FAIL" codes simulate Monime being down during account creation
    const account = b.code!.endsWith("FAIL") ? null : createAccountFor(ft);
    audit(me, "feeType.create", "FeeType", ft.id, null, ft);
    return HttpResponse.json({ ...ft, account, accountError: account ? null : "Monime is unavailable (503). The fee type was saved; create its account again." }, { status: 201 });
  }),
  route("adminRenameFeeType", async ({ request, params, me }) => {
    const ft = db.feeTypes.find((x) => x.id === params.id);
    if (!ft) return fail(404, "NOT_FOUND", "Fee type not found");
    const b = await body<{ name?: string }>(request);
    if (!b.name || b.name.length < 2) return invalid("name must be longer than or equal to 2 characters");
    const before = { ...ft };
    ft.name = b.name;
    audit(me, "feeType.rename", "FeeType", ft.id, before, ft);
    return HttpResponse.json(ft);
  }),
  route("adminFeeTypeAccount", ({ params, me }) => {
    const ft = db.feeTypes.find((x) => x.id === params.id);
    if (!ft) return fail(404, "NOT_FOUND", "Fee type not found");
    const existing = db.accounts.find((a) => a.feeTypeId === ft.id);
    const a = existing ?? createAccountFor(ft);
    if (!existing) audit(me, "account.create", "FinancialAccount", a.id, null, a);
    return HttpResponse.json({ reference: a.reference, monimeId: a.monimeId, name: a.name, purpose: "FEE_TYPE", feeTypeCode: ft.code, created: !existing });
  }),

  // ── fees ──
  route("adminFees", ({ url }) => {
    const ftCode = url.searchParams.get("feeType");
    const status = url.searchParams.get("status");
    const ft = ftCode ? db.feeTypes.find((t) => t.code === ftCode) : null;
    return HttpResponse.json(
      db.fees
        .filter((f) => (!ftCode || f.feeTypeId === ft?.id) && (!status || f.status === status))
        .map((f) => ({
          ...f,
          feeType: db.feeTypes.find((t) => t.id === f.feeTypeId)!,
          _count: { obligations: f.status === "DRAFT" ? 0 : 140, rateRules: db.rateRules.filter((r) => r.feeId === f.id).length },
        })),
    );
  }),
  route("adminCreateFee", async ({ request, me }) => {
    const b = await body<Partial<S["Fee"]>>(request);
    const errors: string[] = [];
    if (!b.feeTypeId || !db.feeTypes.some((t) => t.id === b.feeTypeId)) errors.push("feeTypeId must be a UUID of an existing fee type");
    if (!b.name || b.name.length < 2) errors.push("name must be longer than or equal to 2 characters");
    if (!b.period || !/^[A-Za-z0-9/-]{4,20}$/.test(b.period)) errors.push("period must match /^[A-Za-z0-9/-]{4,20}$/");
    if (typeof b.allowInstalments !== "boolean") errors.push("allowInstalments must be a boolean value");
    if (errors.length) return invalid(...errors);
    if (db.fees.some((f) => f.feeTypeId === b.feeTypeId && f.period === b.period)) return fail(409, "CONFLICT", `A fee for this fee type and period ${b.period} already exists`);
    const fee: S["Fee"] = {
      id: uuid(5), feeTypeId: b.feeTypeId!, name: b.name!, period: b.period!, allowInstalments: b.allowInstalments!,
      defaultMinInstalment: b.defaultMinInstalment ?? null, dueDate: b.dueDate ?? null, status: "DRAFT", createdAt: now(),
    };
    db.fees.push(fee);
    audit(me, "fee.create", "Fee", fee.id, null, fee);
    return HttpResponse.json(fee, { status: 201 });
  }),
  route("adminFee", ({ params }) => {
    const f = db.fees.find((x) => x.id === params.id);
    return f ? HttpResponse.json(feeDetail(f)) : fail(404, "NOT_FOUND", "Fee not found");
  }),
  route("adminUpdateFee", async ({ request, params, me }) => {
    const f = db.fees.find((x) => x.id === params.id);
    if (!f) return fail(404, "NOT_FOUND", "Fee not found");
    const b = await body<Partial<S["Fee"]>>(request);
    if (b.status && b.status !== f.status) {
      const ok = (f.status === "DRAFT" && b.status === "ACTIVE") || (f.status === "ACTIVE" && b.status === "CLOSED") || (f.status === "CLOSED" && b.status === "ACTIVE");
      if (!ok) return fail(409, "INVALID_STATE", `Cannot change status from ${f.status} to ${b.status}`);
      if (b.status === "ACTIVE") {
        if (!db.rateRules.some((r) => r.feeId === f.id)) return fail(409, "INVALID_STATE", "Add at least one rate rule before activating this fee");
        if (!db.accounts.some((a) => a.feeTypeId === f.feeTypeId)) return fail(409, "INVALID_STATE", "The fee type has no Monime account yet. Create it on the Fee types page first.");
      }
    }
    const before = { ...f };
    for (const k of ["name", "allowInstalments", "defaultMinInstalment", "dueDate", "status"] as const) {
      if (k in b) (f as Record<string, unknown>)[k] = b[k];
    }
    audit(me, "fee.update", "Fee", f.id, before, f);
    return HttpResponse.json(f);
  }),
  route("adminPreview", ({ params, url }) => {
    const f = db.fees.find((x) => x.id === params.id);
    if (!f) return fail(404, "NOT_FOUND", "Fee not found");
    const kind = url.searchParams.get("kind") as "applicant" | "student";
    const ref = url.searchParams.get("ref") ?? "";
    const known = db.payments.find((p) => p.payer.ref.toLowerCase() === ref.toLowerCase());
    if (!known && ref.toUpperCase().startsWith("NOPE")) return fail(404, "PAYER_NOT_FOUND", `No ${kind} with ref ${ref}`);
    const payer = {
      kind: (kind === "applicant" ? "APPLICANT" : "STUDENT") as S["PayerKind"],
      ref,
      programCode: known?.payer.programCode ?? "BSC-CS",
      department: known?.payer.department ?? "COMPUTING",
      level: 2,
      residency: (ref.toUpperCase().includes("INT") ? "INTERNATIONAL" : "LOCAL") as S["Residency"],
      intake: "2025-SEP",
      finalYear: false,
    };
    const ft = db.feeTypes.find((t) => t.id === f.feeTypeId)!;
    const base = { payer, fee: { id: f.id, name: f.name, status: f.status, feeType: ft.code } };
    const matches = (r: Partial<Matchers> & { finalYear?: boolean | null }) =>
      (!r.programCode || r.programCode === payer.programCode) &&
      (!r.department || r.department === payer.department) &&
      (r.level == null || r.level === payer.level) &&
      (!r.residency || r.residency === payer.residency) &&
      (!r.intake || r.intake === payer.intake) &&
      (r.finalYear == null || r.finalYear === payer.finalYear);
    if (ft.payerKind !== payer.kind) return HttpResponse.json({ ...base, eligible: false, reason: `This fee is for ${ft.payerKind.toLowerCase()}s`, amount: null, rateRuleId: null, minInstalment: null });
    const elig = db.eligibilityRules.filter((r) => r.feeId === f.id);
    if (elig.length && !elig.some(matches)) return HttpResponse.json({ ...base, eligible: false, reason: "No eligibility rule matches", amount: null, rateRuleId: null, minInstalment: null });
    const rules = db.rateRules.filter((r) => r.feeId === f.id && matches(r)).sort((a, b) => specificity(normMatchers(b)) - specificity(normMatchers(a)));
    const rule = rules[0];
    if (!rule) return HttpResponse.json({ ...base, eligible: true, reason: "No rate rule matches this payer", amount: null, rateRuleId: null, minInstalment: null });
    const inst = db.instalmentRules.find((r) => r.feeId === f.id && r.programCode === payer.programCode);
    return HttpResponse.json({
      ...base, eligible: true, reason: null, amount: rule.amount, rateRuleId: rule.id,
      minInstalment: f.allowInstalments ? (inst?.minInstalment ?? f.defaultMinInstalment) : null,
    });
  }),
  route("adminAddRateRule", async ({ request, params, me }) => {
    const f = db.fees.find((x) => x.id === params.id);
    if (!f) return fail(404, "NOT_FOUND", "Fee not found");
    const b = await body<Partial<Matchers> & { amount?: string }>(request);
    if (!b.amount || !/^[1-9]\d{0,17}$/.test(String(b.amount))) return invalid("amount must be a positive integer string of minor units");
    const m = normMatchers(b);
    const others = db.rateRules.filter((r) => r.feeId === f.id).map(normMatchers);
    if (others.some((o) => MATCHER_KEYS.every((k) => o[k] === m[k]))) return fail(409, "CONFLICT", `A rate rule for ${describeMatchers(m)} already exists`);
    const tie = tieWith(m, others);
    if (tie) {
      return fail(409, "AMBIGUOUS_RATE_RULE", `A payer with ${describeMatchers(tie)} would match two equally specific rules. Add a rule for ${describeMatchers(tie)} first.`, { tieBreaker: tie });
    }
    const rule: S["RateRule"] = { id: uuid(6), feeId: f.id, ...m, amount: String(b.amount), createdAt: now() };
    db.rateRules.push(rule);
    audit(me, "rateRule.create", "Fee", f.id, null, rule);
    return HttpResponse.json(rule, { status: 201 });
  }),
  route("adminUpdateRateRule", async ({ request, params, me }) => {
    const rule = db.rateRules.find((r) => r.id === params.ruleId && r.feeId === params.id);
    if (!rule) return fail(404, "NOT_FOUND", "Rate rule not found");
    const b = await body<Partial<Matchers> & { amount?: string }>(request);
    if (!b.amount || !/^[1-9]\d{0,17}$/.test(String(b.amount))) return invalid("amount must be a positive integer string of minor units");
    const m = normMatchers(b);
    const others = db.rateRules.filter((r) => r.feeId === params.id && r.id !== rule.id).map(normMatchers);
    const tie = tieWith(m, others);
    if (tie) return fail(409, "AMBIGUOUS_RATE_RULE", `A payer with ${describeMatchers(tie)} would match two equally specific rules. Add a rule for ${describeMatchers(tie)} first.`, { tieBreaker: tie });
    const before = { ...rule };
    Object.assign(rule, m, { amount: String(b.amount) });
    audit(me, "rateRule.update", "Fee", params.id, before, rule);
    return HttpResponse.json(rule);
  }),
  route("adminDeleteRateRule", ({ params, me }) => {
    const idx = db.rateRules.findIndex((r) => r.id === params.ruleId && r.feeId === params.id);
    if (idx < 0) return fail(404, "NOT_FOUND", "Rate rule not found");
    const rule = db.rateRules[idx];
    const rest = db.rateRules.filter((r) => r.feeId === params.id && r.id !== rule.id).map(normMatchers);
    for (const m of rest) {
      const tie = tieWith(m, rest.filter((x) => x !== m));
      if (tie) return fail(409, "AMBIGUOUS_RATE_RULE", `This rule breaks a tie for ${describeMatchers(tie)}. Delete one of the tied rules first.`, { tieBreaker: tie });
    }
    db.rateRules.splice(idx, 1);
    audit(me, "rateRule.delete", "Fee", params.id, rule, null);
    return HttpResponse.json({ deleted: true });
  }),
  route("adminAddEligibility", async ({ request, params, me }) => {
    const f = db.fees.find((x) => x.id === params.id);
    if (!f) return fail(404, "NOT_FOUND", "Fee not found");
    const b = await body<Partial<Matchers> & { finalYear?: boolean | null }>(request);
    const rule: S["EligibilityRule"] = { id: uuid(7), feeId: f.id, ...normMatchers(b), finalYear: b.finalYear ?? null };
    db.eligibilityRules.push(rule);
    audit(me, "eligibilityRule.create", "Fee", f.id, null, rule);
    return HttpResponse.json(rule, { status: 201 });
  }),
  route("adminDeleteEligibility", ({ params, me }) => {
    const idx = db.eligibilityRules.findIndex((r) => r.id === params.ruleId && r.feeId === params.id);
    if (idx < 0) return fail(404, "NOT_FOUND", "Eligibility rule not found");
    const [rule] = db.eligibilityRules.splice(idx, 1);
    audit(me, "eligibilityRule.delete", "Fee", params.id, rule, null);
    return HttpResponse.json({ deleted: true });
  }),
  route("adminSetInstalment", async ({ request, params, me }) => {
    const f = db.fees.find((x) => x.id === params.id);
    if (!f) return fail(404, "NOT_FOUND", "Fee not found");
    const b = await body<{ minInstalment?: string }>(request);
    if (!b.minInstalment || !/^[1-9]\d{0,17}$/.test(String(b.minInstalment))) return invalid("minInstalment must be a positive integer string of minor units");
    const code = params.programCode.toUpperCase();
    let rule = db.instalmentRules.find((r) => r.feeId === f.id && r.programCode === code);
    const before = rule ? { ...rule } : null;
    if (rule) Object.assign(rule, { minInstalment: String(b.minInstalment), updatedBy: me.id, updatedAt: now() });
    else {
      rule = { id: uuid(7), feeId: f.id, programCode: code, minInstalment: String(b.minInstalment), updatedBy: me.id, updatedAt: now() };
      db.instalmentRules.push(rule);
    }
    audit(me, "instalmentRule.set", "Fee", f.id, before, rule);
    return HttpResponse.json(rule);
  }),
  route("adminDeleteInstalment", ({ params, me }) => {
    const code = params.programCode.toUpperCase();
    const idx = db.instalmentRules.findIndex((r) => r.feeId === params.id && r.programCode === code);
    if (idx < 0) return fail(404, "NOT_FOUND", "No instalment rule for this program");
    const [rule] = db.instalmentRules.splice(idx, 1);
    audit(me, "instalmentRule.delete", "Fee", params.id, rule, null);
    return HttpResponse.json({ deleted: true });
  }),

  // ── treasury ──
  route("adminListAccounts", () => HttpResponse.json(db.accounts.map(accountItem))),
  route("adminProvisionAccounts", ({ me }) => {
    const out: S["ProvisionedAccount"][] = [];
    for (const ft of db.feeTypes) {
      const existing = db.accounts.find((a) => a.feeTypeId === ft.id);
      const a = existing ?? createAccountFor(ft);
      if (!existing) audit(me, "account.create", "FinancialAccount", a.id, null, a);
      out.push({ reference: a.reference, monimeId: a.monimeId, name: a.name, purpose: "FEE_TYPE", feeTypeCode: ft.code, created: !existing });
    }
    const p = db.accounts.find((a) => a.purpose === "PLATFORM")!;
    out.push({ reference: p.reference, monimeId: p.monimeId, name: p.name, purpose: "PLATFORM", feeTypeCode: null, created: false });
    return HttpResponse.json(out);
  }),
  route("adminRefreshBalance", ({ params }) => {
    const a = db.accounts.find((x) => x.id === params.id);
    if (!a) return fail(404, "NOT_FOUND", "Account not found");
    a.balanceUpdatedAt = now();
    a.availableBalance ??= "0";
    return HttpResponse.json(a);
  }),
  route("adminBanks", () => HttpResponse.json(db.banks)),
  route("adminListPayouts", ({ url }) => {
    db.payouts.forEach(advancePayout);
    const status = url.searchParams.get("status");
    const rows = sorted(db.payouts.filter((p) => !status || p.status === status), url).map((p) => {
      const a = db.accounts.find((x) => x.id === p.financialAccountId)!;
      return { ...p, financialAccount: { reference: a.reference, monimeId: a.monimeId } };
    });
    return page(rows, url);
  }),
  route("adminCreatePayout", async ({ request, me }) => {
    const b = await body<{ account?: string; amount?: string; bankProviderId?: string; accountNumber?: string; accountName?: string; narration?: string; idempotencyKey?: string }>(request);
    const errors: string[] = [];
    if (!b.account) errors.push("account should not be empty");
    if (!b.amount || !/^[1-9]\d{0,17}$/.test(String(b.amount))) errors.push("amount must be a positive integer string of minor units");
    if (!b.bankProviderId || !/^[a-z0-9]{2,20}$/.test(b.bankProviderId)) errors.push("bankProviderId must match /^[a-z0-9]{2,20}$/");
    if (!b.accountNumber || !/^\d{4,34}$/.test(b.accountNumber)) errors.push("accountNumber must be 4 to 34 digits");
    if (!b.idempotencyKey || b.idempotencyKey.length < 8) errors.push("idempotencyKey must be longer than or equal to 8 characters");
    if (errors.length) return invalid(...errors);
    // e2e hook: record every key; "SIMULATE_503" in the narration fails the first attempt per key
    // (Monime down, nothing created) so the UI's retry-with-the-same-key path can be tested.
    mockPayoutAttempts.push(b.idempotencyKey!);
    if (b.narration?.includes("SIMULATE_503") && mockPayoutAttempts.filter((k) => k === b.idempotencyKey).length === 1) {
      return fail(503, "UPSTREAM_UNAVAILABLE", "Monime is unavailable (simulated)");
    }
    const existing = db.payouts.find((p) => p.idempotencyKey === b.idempotencyKey);
    if (existing) {
      const same = existing.amount === String(b.amount) && existing.accountNumber === b.accountNumber;
      return same ? HttpResponse.json(existing, { status: 201 }) : fail(409, "IDEMPOTENCY_CONFLICT", "This idempotency key was used for a different payout");
    }
    const a = db.accounts.find((x) => x.reference === b.account || x.monimeId === b.account);
    if (!a) return fail(404, "NOT_FOUND", `Account ${b.account} not found`);
    const bank = db.banks.find((x) => x.providerId === b.bankProviderId);
    if (!bank?.canPayTo) return fail(422, "UNPROCESSABLE", "Monime cannot pay out to this bank");
    if (BigInt(b.amount!) > BigInt(a.availableBalance ?? "0")) return fail(422, "AMOUNT_EXCEEDS_PAYABLE", "The amount is more than the account's available balance");
    const p: S["Payout"] = {
      id: uuid(13), financialAccountId: a.id, amount: String(b.amount), destinationType: "bank", providerId: b.bankProviderId!,
      accountNumber: b.accountNumber!, accountName: b.accountName || null, narration: b.narration || null, status: "SUBMITTED",
      monimePayoutId: `pyt-${Math.random().toString(36).slice(2, 10)}`, fees: null, failureCode: null, failureMessage: null,
      requestedBy: me.id, idempotencyKey: b.idempotencyKey!, createdAt: now(), updatedAt: now(), completedAt: null,
    };
    db.payouts.unshift(p);
    a.availableBalance = (BigInt(a.availableBalance ?? "0") - BigInt(p.amount)).toString();
    payoutSubmittedAt.set(p.id, Date.now());
    audit(me, "payout.create", "Payout", p.id, null, p);
    return HttpResponse.json(p, { status: 201 });
  }),
  route("adminGetPayout", ({ params }) => {
    const p = db.payouts.find((x) => x.id === params.id);
    if (!p) return fail(404, "NOT_FOUND", "Payout not found");
    advancePayout(p);
    return HttpResponse.json({ ...p, financialAccount: db.accounts.find((a) => a.id === p.financialAccountId)! });
  }),
  route("adminListTransfers", ({ url }) => {
    const status = url.searchParams.get("status");
    return page(sorted(db.transfers.filter((t) => !status || t.status === status), url), url);
  }),
  route("adminGetTransfer", ({ params }) => {
    const t = db.transfers.find((x) => x.id === params.id);
    return t ? HttpResponse.json(t) : fail(404, "NOT_FOUND", "Transfer not found");
  }),
  route("adminRetryTransfer", ({ params, me }) => {
    const t = db.transfers.find((x) => x.id === params.id);
    if (!t) return fail(404, "NOT_FOUND", "Transfer not found");
    if (t.status !== "FAILED") return fail(409, "INVALID_STATE", `Only FAILED transfers can be retried (is ${t.status})`);
    const before = { ...t };
    Object.assign(t, { status: "SUBMITTED", attempt: t.attempt + 1, failureCode: null, failureMessage: null, updatedAt: now() });
    audit(me, "transfer.retry", "Transfer", t.id, before, t);
    return HttpResponse.json(t);
  }),
  route("adminOutbox", ({ url }) => {
    const status = url.searchParams.get("status");
    return page(db.outbox.filter((m) => !status || m.status === status), url);
  }),
  route("adminGetOutbox", ({ params }) => {
    const m = db.outbox.find((x) => x.id === params.id);
    return m ? HttpResponse.json(m) : fail(404, "NOT_FOUND", "Outbox message not found");
  }),
  route("adminRetryOutbox", ({ params, me }) => {
    const m = db.outbox.find((x) => x.id === params.id);
    if (!m) return fail(404, "NOT_FOUND", "Outbox message not found");
    if (m.status !== "DEAD") return fail(409, "INVALID_STATE", `Only DEAD messages can be retried (is ${m.status})`);
    const before = { ...m };
    Object.assign(m, { status: "SENT", attempts: 0, lastError: null, sentAt: now() });
    audit(me, "outbox.retry", "OutboxMessage", m.id, before, m);
    return HttpResponse.json(m);
  }),

  // ── reconciliation ──
  route("adminReconciliation", () => {
    const hourAgo = new Date(Date.parse(now()) - 3_600_000).toISOString();
    const weekAgo = new Date(Date.parse(now()) - 7 * 86_400_000).toISOString();
    const lists = {
      openItems: db.items.filter((i) => i.status === "OPEN"),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      webhookEvents: db.webhookEvents.filter((e) => (e.status === "UNMATCHED" || e.status === "FAILED") && !e.resolvedAt).map(({ payload, ...e }) => e),
      failedTransfers: db.transfers.filter((t) => t.status === "FAILED"),
      stuckTransfers: db.transfers.filter((t) => (t.status === "PENDING" || t.status === "SUBMITTED") && t.createdAt < hourAgo),
      stuckPayouts: db.payouts.filter((p) => ["REQUESTED", "SUBMITTED", "PROCESSING"].includes(p.status) && p.createdAt < hourAgo),
      failedPayouts: db.payouts.filter((p) => p.status === "FAILED" && p.updatedAt > weekAgo),
      deadOutbox: db.outbox.filter((m) => m.status === "DEAD"),
      staleOpenPayments: db.payments.filter((p) => (p.status === "PENDING" || p.status === "INITIATED") && p.expiresAt < now()).map(listPayment),
    };
    const counts = Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length])) as S["ReconciliationSummary"]["counts"];
    const limit = 100;
    const capped = Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.slice(0, limit)]));
    return HttpResponse.json({ lastRun: db.runs[0] ?? null, counts, listLimit: limit, ...capped });
  }),
  route("adminRuns", ({ url }) => {
    const status = url.searchParams.get("status");
    return page(db.runs.filter((r) => !status || r.status === status), url);
  }),
  route("adminStartRun", async ({ request, me }) => {
    const b = await body<{ date?: string }>(request);
    const date = b.date ?? addDay(now().slice(0, 10), -1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid("date must be a valid ISO 8601 date string");
    await delay(800);
    const run: S["ReconciliationRun"] = {
      id: uuid(15), windowStart: `${date}T00:00:00.000Z`, windowEnd: `${addDay(date, 1)}T00:00:00.000Z`, status: "COMPLETED", triggeredBy: me.id,
      startedAt: now(), finishedAt: now(), stats: { monimePayments: 9, matched: 9, autoSettled: 0, flagged: 0 }, error: null,
    };
    db.runs.unshift(run);
    audit(me, "reconciliation.run", "ReconciliationRun", run.id, null, run);
    return HttpResponse.json({ ...run, items: [] }, { status: 201 });
  }),
  route("adminRun", ({ params }) => {
    const run = db.runs.find((r) => r.id === params.id);
    return run ? HttpResponse.json({ ...run, items: db.items.filter((i) => i.runId === run.id) }) : fail(404, "NOT_FOUND", "Run not found");
  }),
  route("adminListItems", ({ url }) => {
    const q = Object.fromEntries(url.searchParams);
    return page(db.items.filter((i) => (!q.status || i.status === q.status) && (!q.runId || i.runId === q.runId) && (!q.kind || i.kind === q.kind)), url);
  }),
  route("adminResolveItem", async ({ request, params, me }) => {
    const item = db.items.find((i) => i.id === params.id);
    if (!item) return fail(404, "NOT_FOUND", "Item not found");
    const b = await body<{ resolution?: string }>(request);
    if (!b.resolution || b.resolution.trim().length < 3) return invalid("resolution must be longer than or equal to 3 characters");
    if (item.status !== "OPEN") return fail(409, "INVALID_STATE", `Item is ${item.status}`);
    const before = { ...item };
    Object.assign(item, { status: "RESOLVED", resolvedAt: now(), resolvedBy: me.id, resolution: b.resolution });
    audit(me, "reconciliation.resolveItem", "ReconciliationItem", item.id, before, item);
    return HttpResponse.json(item);
  }),
  route("adminListWebhookEvents", ({ url }) => {
    const q = Object.fromEntries(url.searchParams);
    const rows = db.webhookEvents
      .filter((e) => (!q.status || e.status === q.status) && (!q.type || e.type === q.type) && (q.unresolved !== "true" || !e.resolvedAt))
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ payload, ...e }) => e);
    return page(rows, url);
  }),
  route("adminWebhookEvent", ({ params }) => {
    const e = db.webhookEvents.find((x) => x.id === params.id);
    return e ? HttpResponse.json(e) : fail(404, "NOT_FOUND", "Webhook event not found");
  }),
  route("adminResolveEvent", async ({ request, params, me }) => {
    const e = db.webhookEvents.find((x) => x.id === params.id);
    if (!e) return fail(404, "NOT_FOUND", "Webhook event not found");
    const b = await body<{ resolution?: string }>(request);
    if (!b.resolution || b.resolution.trim().length < 3) return invalid("resolution must be longer than or equal to 3 characters");
    if (e.status !== "UNMATCHED" && e.status !== "FAILED") return fail(409, "INVALID_STATE", `Event is ${e.status}`);
    if (e.resolvedAt) return fail(409, "INVALID_STATE", "Event already resolved");
    const before = { ...e };
    Object.assign(e, { resolvedAt: now(), resolvedBy: me.id, resolution: b.resolution });
    audit(me, "webhook.resolve", "WebhookEvent", e.id, before, e);
    return HttpResponse.json(e);
  }),
  route("adminReplayEvent", ({ params, me }) => {
    const e = db.webhookEvents.find((x) => x.id === params.id);
    if (!e) return fail(404, "NOT_FOUND", "Webhook event not found");
    const before = { ...e };
    const result = e.status === "UNMATCHED" ? "UNMATCHED" : "PROCESSED";
    Object.assign(e, { status: result, attempts: e.attempts + 1, processedAt: now() });
    audit(me, "webhook.replay", "WebhookEvent", e.id, before, e);
    return HttpResponse.json({ received: true, eventId: e.id, result, ...(result === "UNMATCHED" && { note: "Still no payment matches metadata.paymentRef" }) });
  }),
];
