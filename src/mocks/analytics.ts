/**
 * The outstanding report, payer list, CSV and payer detail over the mock roster, mirroring
 * the backend's admin-analytics.service.ts (docs/analytics.md): billed = CHARGE + ADJUSTMENT,
 * collected = -(PAYMENT + REFUND), outstanding = each obligation's positive balance, overdue =
 * outstanding on a fee whose due date has passed.
 */
import type { components } from "@/api/schema.gen";
import type { Db, RosterObligation, RosterPayer } from "./db";

type S = components["schemas"];
type Principal = S["AdminPrincipal"];
type Standing = S["Standing"];

const KINDS = ["STUDENT", "APPLICANT"] as const;
const STANDINGS = ["NOT_BILLED", "PAID", "PART_PAID", "UNPAID", "OVERDUE"] as const;
const SORTS = ["-balance", "balance", "name", "ref"] as const;
const ENROLMENT = ["ACTIVE", "SUSPENDED", "WITHDRAWN", "GRADUATED"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Filters = {
  feeId?: string;
  feeType?: string;
  period?: string;
  faculty?: string;
  department?: string;
  level?: number;
  includeInactive: boolean;
  kind?: (typeof KINDS)[number];
  enrolmentStatus?: (typeof ENROLMENT)[number];
  q?: string;
  standing?: (typeof STANDINGS)[number];
  sort: (typeof SORTS)[number];
};

/** Query → filters, or the validation messages the backend's DTOs would give. */
export function parseFilters(url: URL): Filters | string[] {
  const q = (k: string) => url.searchParams.get(k) ?? undefined;
  const errors: string[] = [];
  const oneOf = <T extends string>(k: string, values: readonly T[]): T | undefined => {
    const v = q(k);
    if (v === undefined || v === "") return undefined;
    if (!(values as readonly string[]).includes(v)) errors.push(`${k} must be one of the following values: ${values.join(", ")}`);
    return v as T;
  };
  const levelRaw = q("level");
  const level = levelRaw ? Number(levelRaw) : undefined;
  if (level !== undefined && !(Number.isInteger(level) && level >= 1 && level <= 10)) errors.push("level must not be greater than 10, level must not be less than 1, level must be an integer number");
  const inactive = q("includeInactive");
  if (inactive && inactive !== "true" && inactive !== "false") errors.push("includeInactive must be a boolean value");
  const feeId = q("feeId") || undefined;
  if (feeId && !UUID.test(feeId)) errors.push("feeId must be a UUID");
  const search = q("q") || undefined;
  if (search && search.length > 64) errors.push("q must be shorter than or equal to 64 characters");
  const f: Filters = {
    feeId,
    feeType: q("feeType") || undefined,
    period: q("period") || undefined,
    faculty: q("faculty") || undefined,
    department: q("department") || undefined,
    level,
    includeInactive: inactive === "true",
    kind: oneOf("kind", KINDS),
    enrolmentStatus: oneOf("enrolmentStatus", ENROLMENT),
    q: search,
    standing: oneOf("standing", STANDINGS),
    sort: oneOf("sort", SORTS) ?? "-balance",
  };
  return errors.length ? errors : f;
}

const big = (s: string) => BigInt(s);
const pos = (v: bigint) => (v > 0n ? v : 0n);

/** collected ÷ billed, 0–1 to 3 decimals; null when nothing is billed. */
export function collectionRate(billed: bigint, collected: bigint): number | null {
  if (billed <= 0n) return null;
  const permille = (collected * 1000n) / billed;
  return Number(permille < 0n ? 0n : permille > 1000n ? 1000n : permille) / 1000;
}

function standing(b: { obligations: number; collected: bigint; outstanding: bigint }): Standing {
  if (b.obligations === 0) return "NOT_BILLED";
  if (b.outstanding <= 0n) return "PAID";
  return b.collected > 0n ? "PART_PAID" : "UNPAID";
}

export function maskPhone(phone: string): string {
  if (phone.length <= 7) return "*".repeat(phone.length);
  return phone.slice(0, 4) + "*".repeat(phone.length - 7) + phone.slice(-3);
}

export function createAnalytics(getDb: () => Db, now: () => string) {
  const dept = (code: string | null) => {
    const db = getDb();
    const d = code ? db.departments.find((x) => x.code === code) : undefined;
    const fa = d?.facultyId ? db.faculties.find((x) => x.id === d.facultyId) : undefined;
    return { departmentName: d?.name ?? null, facultyCode: fa?.code ?? null, facultyName: fa?.name ?? null };
  };
  const departmentsOf = (faculty: string) => {
    const db = getDb();
    const fa = db.faculties.find((x) => x.code === faculty);
    return db.departments.filter((d) => fa && d.facultyId === fa.id).map((d) => d.code);
  };
  const feeOf = (id: string) => {
    const db = getDb();
    const fee = db.fees.find((x) => x.id === id)!;
    const ft = db.feeTypes.find((t) => t.id === fee.feeTypeId)!;
    return { fee, ft };
  };
  const feeSelected = (f: Filters, feeId: string) => {
    const { fee, ft } = feeOf(feeId);
    return (!f.feeId || fee.id === f.feeId) && (!f.feeType || ft.code === f.feeType) && (!f.period || fee.period === f.period);
  };
  const feeFiltered = (f: Filters) => !!(f.feeId || f.feeType || f.period);

  /** billed / collected / balance of one obligation, and whether its fee is past due */
  function sums(o: RosterObligation) {
    const sum = (types: string[]) => o.entries.filter((e) => types.includes(e.type)).reduce((s, e) => s + big(e.amount), 0n);
    const { fee } = feeOf(o.feeId);
    const balance = o.entries.reduce((s, e) => s + big(e.amount), 0n);
    const due = !!fee.dueDate && `${fee.dueDate}T00:00:00.000Z` < now();
    return { billed: sum(["CHARGE", "ADJUSTMENT"]), collected: -sum(["PAYMENT", "REFUND"]), balance, due };
  }

  function payerMatches(p: RosterPayer, f: Filters, me: Principal) {
    if (f.kind && p.kind !== f.kind) return false;
    if (f.department && p.department !== f.department) return false;
    if (f.faculty && !departmentsOf(f.faculty).includes(p.department ?? "")) return false;
    if (f.level !== undefined && p.level !== f.level) return false;
    if (f.enrolmentStatus && p.enrolmentStatus !== f.enrolmentStatus) return false;
    if (f.kind !== "APPLICANT" && !f.enrolmentStatus && !f.includeInactive && p.kind === "STUDENT" && p.enrolmentStatus && p.enrolmentStatus !== "ACTIVE") return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      if (!p.ref.toLowerCase().includes(q) && !p.fullName.toLowerCase().includes(q)) return false;
    }
    if (me.departmentScoped && !me.departments.includes(p.department ?? "")) return false;
    return true;
  }

  /** `pp` in the backend: each matching payer with sums over the selected fees' obligations. */
  function balances(f: Filters, me: Principal) {
    const db = getDb();
    return db.roster.payers
      .filter((p) => payerMatches(p, f, me))
      .map((p) => {
        const obs = db.roster.obligations.filter((o) => o.payerId === p.id && feeSelected(f, o.feeId)).map((o) => ({ o, ...sums(o) }));
        return {
          p,
          obs,
          obligations: obs.length,
          billed: obs.reduce((s, x) => s + x.billed, 0n),
          collected: obs.reduce((s, x) => s + x.collected, 0n),
          outstanding: obs.reduce((s, x) => s + pos(x.balance), 0n),
          overdueAmount: obs.reduce((s, x) => s + (x.due ? pos(x.balance) : 0n), 0n),
        };
      });
  }
  type PP = ReturnType<typeof balances>[number];

  function cell(rows: PP[]) {
    const billed = rows.reduce((s, x) => s + x.billed, 0n);
    const collected = rows.reduce((s, x) => s + x.collected, 0n);
    return {
      students: rows.length,
      billed: billed.toString(),
      collected: collected.toString(),
      outstanding: rows.reduce((s, x) => s + x.outstanding, 0n).toString(),
      paid: rows.filter((x) => x.outstanding <= 0n).length,
      partPaid: rows.filter((x) => x.outstanding > 0n && x.collected > 0n).length,
      unpaid: rows.filter((x) => x.outstanding > 0n && x.collected <= 0n).length,
      overdue: rows.filter((x) => x.overdueAmount > 0n).length,
      overdueAmount: rows.reduce((s, x) => s + x.overdueAmount, 0n).toString(),
      collectionRate: collectionRate(billed, collected),
    };
  }

  function outstanding(f: Filters, me: Principal): S["OutstandingReport"] {
    const db = getDb();
    const students = balances({ ...f, kind: "STUDENT" }, me).filter((x) => x.obligations > 0);
    const cells = new Map<string, PP[]>();
    for (const x of students) {
      const k = `${x.p.department ?? ""}|${x.p.level ?? ""}`;
      cells.set(k, [...(cells.get(k) ?? []), x]);
    }
    const nullsLast = (a: string | number | null, b: string | number | null) =>
      a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;
    const grid = [...cells.values()]
      .map((rows) => ({ department: rows[0].p.department, ...dept(rows[0].p.department), level: rows[0].p.level, ...cell(rows) }))
      .sort((a, b) => nullsLast(a.facultyCode, b.facultyCode) || nullsLast(a.department, b.department) || nullsLast(a.level, b.level));

    const byFeeMap = new Map<string, ReturnType<typeof sums>[]>();
    for (const x of students) for (const o of x.obs) byFeeMap.set(o.o.feeId, [...(byFeeMap.get(o.o.feeId) ?? []), o]);
    const byFee = [...byFeeMap.entries()]
      .map(([feeId, obs]) => {
        const { fee, ft } = feeOf(feeId);
        const billed = obs.reduce((s, o) => s + o.billed, 0n);
        const collected = obs.reduce((s, o) => s + o.collected, 0n);
        return {
          feeId, feeName: fee.name, period: fee.period, feeTypeCode: ft.code, dueDate: fee.dueDate ? `${fee.dueDate}T00:00:00.000Z` : null,
          obligations: obs.length, billed: billed.toString(), collected: collected.toString(),
          outstanding: obs.reduce((s, o) => s + pos(o.balance), 0n).toString(), collectionRate: collectionRate(billed, collected),
        };
      })
      .sort((a, b) => b.feeTypeCode.localeCompare(a.feeTypeCode) || b.period.localeCompare(a.period) || a.feeName.localeCompare(b.feeName));

    const applicants = balances({ ...f, kind: "APPLICANT", level: undefined }, me).filter((x) => x.obligations > 0);
    const byStatusMap = new Map<string | null, PP[]>();
    for (const x of applicants) byStatusMap.set(x.p.applicantStatus, [...(byStatusMap.get(x.p.applicantStatus) ?? []), x]);
    const byStatus = [...byStatusMap.entries()]
      .map(([status, rows]) => ({
        status,
        applicants: rows.length,
        billed: rows.reduce((s, x) => s + x.billed, 0n).toString(),
        collected: rows.reduce((s, x) => s + x.collected, 0n).toString(),
        outstanding: rows.reduce((s, x) => s + x.outstanding, 0n).toString(),
        paid: rows.filter((x) => x.outstanding <= 0n).length,
      }))
      .sort((a, b) => nullsLast(a.status, b.status));

    // every active student in scope, whatever the fee filter
    const active = db.roster.payers.filter((p) => payerMatches(p, { ...f, kind: "STUDENT", includeInactive: false, feeId: undefined, feeType: undefined, period: undefined }, me));
    const { collectionRate: rate, ...totals } = cell(students);
    return {
      asOf: now(),
      filters: {
        feeId: f.feeId ?? null, feeType: f.feeType ?? null, period: f.period ?? null, faculty: f.faculty ?? null, department: f.department ?? null,
        level: f.level ?? null, includeInactive: f.includeInactive, departments: me.departmentScoped ? [...me.departments] : null,
      },
      totals: { ...totals, collectionRate: rate },
      grid,
      byFee,
      applicants: { byStatus },
      roster: {
        activeStudents: active.length,
        withoutObligations: active.filter((p) => !db.roster.obligations.some((o) => o.payerId === p.id)).length,
        lastPortalEventAt: db.portalEvents.find((e) => e.result === "APPLIED")?.receivedAt ?? null,
      },
    };
  }

  function rows(f: Filters, me: Principal) {
    const db = getDb();
    const out = balances(f, me).filter((x) => {
      if (feeFiltered(f) && x.obligations === 0) return false;
      if (f.standing === "OVERDUE") return x.overdueAmount > 0n;
      return !f.standing || standing(x) === f.standing;
    });
    const by = {
      "-balance": (a: PP, b: PP) => (a.outstanding === b.outstanding ? 0 : a.outstanding > b.outstanding ? -1 : 1),
      balance: (a: PP, b: PP) => (a.outstanding === b.outstanding ? 0 : a.outstanding < b.outstanding ? -1 : 1),
      name: (a: PP, b: PP) => (a.p.fullName < b.p.fullName ? -1 : a.p.fullName > b.p.fullName ? 1 : 0),
      ref: (a: PP, b: PP) => (a.p.ref < b.p.ref ? -1 : a.p.ref > b.p.ref ? 1 : 0),
    }[f.sort];
    return out
      .sort((a, b) => by(a, b) || (a.p.id < b.p.id ? -1 : 1))
      .map((x): S["PayerListItem"] => {
        const lastPaymentAt =
          db.roster.obligations
            .filter((o) => o.payerId === x.p.id)
            .flatMap((o) => o.payments)
            .filter((pm) => pm.status === "COMPLETED" && pm.completedAt)
            .map((pm) => pm.completedAt!)
            .sort()
            .at(-1) ?? null;
        const d = dept(x.p.department);
        return {
          id: x.p.id, kind: x.p.kind, ref: x.p.ref, fullName: x.p.fullName, maskedPhone: maskPhone(x.p.phone), programCode: x.p.programCode,
          department: x.p.department, departmentName: d.departmentName, facultyCode: d.facultyCode, level: x.p.level,
          enrolmentStatus: x.p.enrolmentStatus, applicantStatus: x.p.applicantStatus, obligations: x.obligations,
          billed: x.billed.toString(), collected: x.collected.toString(), balance: x.outstanding.toString(), standing: standing(x),
          overdue: x.overdueAmount > 0n, overdueAmount: x.overdueAmount.toString(), lastPaymentAt,
        };
      });
  }

  /** Opaque cursor that remembers the sort, like the backend's keyset cursor. */
  function list(f: Filters, me: Principal, url: URL): { items: S["PayerListItem"][]; nextCursor: string | null } | string {
    const all = rows(f, me);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const cursor = url.searchParams.get("cursor");
    let start = 0;
    if (cursor) {
      let c: { s?: string; id?: string } = {};
      try {
        c = JSON.parse(atob(cursor.replace(/-/g, "+").replace(/_/g, "/")));
      } catch {
        /* invalid below */
      }
      const i = all.findIndex((x) => x.id === c.id);
      if (c.s !== f.sort || i < 0) return "cursor is not valid; use nextCursor from the previous page with the same sort";
      start = i + 1;
    }
    const items = all.slice(start, start + limit);
    const last = items.at(-1);
    const nextCursor = start + limit < all.length && last ? btoa(JSON.stringify({ s: f.sort, id: last.id })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : null;
    return { items, nextCursor };
  }

  function csv(f: Filters, me: Principal): string {
    const cell = (v: unknown) => {
      let s = v === null || v === undefined ? "" : String(v);
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const sle = (m: string) => {
      const v = BigInt(m);
      const a = v < 0n ? -v : v;
      return `${v < 0n ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
    };
    const cols = [
      "kind", "ref", "full_name", "phone_masked", "program", "department", "department_name", "faculty", "level", "enrolment_status",
      "applicant_status", "obligations", "billed_sle", "collected_sle", "balance_sle", "standing", "overdue", "overdue_sle", "last_payment_at", "payer_id",
    ];
    const lines = rows(f, me).map((p) =>
      [
        p.kind, p.ref, p.fullName, p.maskedPhone, p.programCode, p.department, p.departmentName, p.facultyCode, p.level, p.enrolmentStatus,
        p.applicantStatus, p.obligations, sle(p.billed), sle(p.collected), sle(p.balance), p.standing, p.overdue, sle(p.overdueAmount), p.lastPaymentAt, p.id,
      ]
        .map(cell)
        .join(","),
    );
    return "﻿" + [cols.join(","), ...lines].join("\r\n") + "\r\n";
  }

  function detail(id: string, me: Principal): S["PayerDetail"] | null {
    const db = getDb();
    const p = db.roster.payers.find((x) => x.id === id);
    if (!p || (me.departmentScoped && !me.departments.includes(p.department ?? ""))) return null;
    const obligations = db.roster.obligations
      .filter((o) => o.payerId === p.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((o) => {
        const { fee, ft } = feeOf(o.feeId);
        const s = sums(o);
        const outstanding = pos(s.balance);
        const rules = db.instalmentRules.filter((r) => r.feeId === fee.id && r.department === p.department);
        const rule = (p.level !== null ? rules.find((r) => r.level === p.level) : undefined) ?? rules.find((r) => r.level === null);
        const min = outstanding <= 0n ? 0n : !fee.allowInstalments ? outstanding : BigInt(rule?.minInstalment ?? fee.defaultMinInstalment ?? outstanding.toString());
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { payerId, feeId, ...rest } = o;
        return {
          ...rest,
          entries: [...o.entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
          payments: [...o.payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          fee: { id: fee.id, name: fee.name, period: fee.period, feeTypeCode: ft.code, status: fee.status, dueDate: fee.dueDate ? `${fee.dueDate}T00:00:00.000Z` : null },
          billed: s.billed.toString(),
          collected: s.collected.toString(),
          balance: s.balance.toString(),
          overdue: outstanding > 0n && s.due,
          minInstalment: (min < outstanding ? min : outstanding).toString(),
        };
      });
    const billed = obligations.reduce((s, o) => s + big(o.billed), 0n);
    const collected = obligations.reduce((s, o) => s + big(o.collected), 0n);
    const outstanding = obligations.reduce((s, o) => s + pos(big(o.balance)), 0n);
    const other =
      p.kind === "STUDENT"
        ? p.applicationRef
          ? db.roster.payers.find((x) => x.kind === "APPLICANT" && x.ref === p.applicationRef)
          : undefined
        : db.roster.payers.find((x) => x.kind === "STUDENT" && x.applicationRef === p.ref);
    const link = other ? { id: other.id, ref: other.ref } : null;
    return {
      payer: { ...p, ...dept(p.department) },
      linked: { applicant: p.kind === "STUDENT" ? link : null, student: p.kind === "APPLICANT" ? link : null },
      totals: {
        obligations: obligations.length,
        billed: billed.toString(),
        collected: collected.toString(),
        outstanding: outstanding.toString(),
        standing: standing({ obligations: obligations.length, collected, outstanding }),
        overdue: obligations.some((o) => o.overdue),
        collectionRate: collectionRate(billed, collected),
      },
      obligations,
      receipts: db.roster.receipts
        .filter((r) => r.payerId === p.id)
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ payerId, ...r }) => r),
      portalEvents: db.portalEvents
        .filter((e) => e.ref === p.ref && e.type === (p.kind === "STUDENT" ? "student.upserted" : "applicant.upserted"))
        .slice(0, 20)
        .map((e) => ({ id: e.id, type: e.type, result: e.result, error: e.error, occurredAt: e.occurredAt, receivedAt: e.receivedAt })),
    };
  }

  return { outstanding, list, csv, detail };
}
