/**
 * In-memory fixture data for MSW (dev:mock and e2e). Shapes come from openapi.yaml types,
 * so a spec change that breaks a fixture breaks the typecheck. Deterministic (seeded).
 */
import type { components } from "@/api/schema.gen";

type S = components["schemas"];
export type Db = ReturnType<typeof createDb>;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

let idCounter = 0;
/** Deterministic UUID-shaped ids (cursors are UUIDs in the spec). */
export function uuid(prefix = 0): string {
  idCounter += 1;
  const hex = (prefix * 1_000_000 + idCounter).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

const NOW = Date.parse("2026-11-19T12:00:00Z");
export const mockNow = () => NOW;
const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 86_400_000;

const NONE: string[] = [];
export const PERSONAS = {
  "super@unimak.test": { role: "SUPER_ADMIN", name: "Aminata Sesay", mfaEnrolled: true, departments: NONE, faculties: NONE },
  "bursar@unimak.test": { role: "BURSAR", name: "Ibrahim Kamara", mfaEnrolled: false, departments: NONE, faculties: NONE },
  "finance@unimak.test": { role: "FINANCE_OFFICER", name: "Fatmata Conteh", mfaEnrolled: false, departments: NONE, faculties: NONE },
  "hod@unimak.test": { role: "HEAD_OF_DEPARTMENT", name: "Dr. Musa Bangura", mfaEnrolled: false, departments: ["COMPUTING"], faculties: NONE },
  "dean@unimak.test": { role: "DEAN", name: "Prof. Isata Turay", mfaEnrolled: false, departments: NONE, faculties: ["FAC-SCI-TECH"] },
  "auditor@unimak.test": { role: "AUDITOR", name: "Hawa Koroma", mfaEnrolled: false, departments: NONE, faculties: NONE },
} as const satisfies Record<string, { role: S["AdminRole"]; name: string; mfaEnrolled: boolean; departments: string[]; faculties: string[] }>;
export type PersonaEmail = keyof typeof PERSONAS;

const ALL_PERMS: S["Permission"][] = [
  "fees.read", "fees.manage", "instalments.manage", "payers.read", "payers.adjust", "payments.read", "payments.export",
  "payments.refund", "payments.reconcile", "receipts.resend", "accounts.read", "accounts.manage", "payouts.read",
  "payouts.manage", "transfers.read", "transfers.retry", "reconciliation.read", "reconciliation.manage", "outbox.read",
  "outbox.retry", "reports.read", "audit.read", "users.manage", "settings.manage", "academics.manage", "portal.read", "clearance.manage",
];
/**
 * Mirrors the backend's role bundles (fixtures only; the app reads `me.permissions`). Commission
 * transfers (transfers.read / transfers.retry) are super-admin only unless granted on their own.
 */
export const ROLE_PERMISSIONS: Record<S["AdminRole"], S["Permission"][]> = {
  SUPER_ADMIN: ALL_PERMS,
  BURSAR: [
    "fees.read", "fees.manage", "instalments.manage", "payers.read", "payers.adjust", "payments.read", "payments.export",
    "payments.refund", "payments.reconcile", "receipts.resend", "accounts.read", "payouts.read",
    "reconciliation.read", "reconciliation.manage", "outbox.read", "outbox.retry", "portal.read", "reports.read",
    "clearance.manage",
  ],
  FINANCE_OFFICER: [
    "payers.read", "payments.read", "payments.export", "receipts.resend", "accounts.read", "payouts.read",
    "reconciliation.read", "reports.read",
  ],
  HEAD_OF_DEPARTMENT: ["fees.read", "payers.read", "payments.read", "reports.read"],
  DEAN: ["fees.read", "payers.read", "payments.read", "reports.read"],
  AUDITOR: ALL_PERMS.filter((p) => p.endsWith(".read") && p !== "transfers.read"),
};

const FEE_TYPES: [string, string, S["PayerKind"], S["Recurrence"], string][] = [
  ["APP", "Application fee", "APPLICANT", "ONCE", "15000"],
  ["MATRIC", "Matriculation", "STUDENT", "ONCE", "50000"],
  ["TUITION", "Tuition", "STUDENT", "PER_YEAR", "450000"],
  ["DEPT", "Department levy", "STUDENT", "PER_YEAR", "30000"],
  ["GRAD", "Graduation", "STUDENT", "ONCE", "80000"],
];
/** [code, name, active] */
const FACULTIES = [
  ["FAC-SCI-TECH", "Faculty of Science & Technology", true],
  ["FAC-SOC-SCI", "Faculty of Social Sciences", true],
  ["FAC-NURSING-AHS", "Faculty of Nursing & Allied Health Sciences", true],
  ["FAC-LAW", "Faculty of Law", true],
  ["FAC-AGRIC", "Faculty of Agriculture", false],
] as const;
/** [code, name, facultyCode | null (needs review), active] */
const DEPARTMENTS = [
  ["COMPUTING", "Computer Science", "FAC-SCI-TECH", true],
  ["INFO-TECH", "Information Technology", "FAC-SCI-TECH", true],
  ["MATHS", "Mathematics", "FAC-SCI-TECH", false],
  ["ECONOMICS", "Economics", "FAC-SOC-SCI", true],
  ["NURSING", "Nursing", "FAC-NURSING-AHS", true],
  ["LAW", "Law", "FAC-LAW", true],
  // the portal sent this one; nobody has set it up yet
  ["MASS-COMM", "MASS-COMM", null, true],
] as const;
const PROGRAMS = [
  ["BSC-CS", "COMPUTING"],
  ["BSC-IT", "INFO-TECH"],
  ["BA-ECON", "ECONOMICS"],
  ["BSC-NURS", "NURSING"],
  ["LLB", "LAW"],
  ["BA-MC", "MASS-COMM"],
] as const;
const FIRST = ["Mohamed", "Fatmata", "Abdul", "Isatu", "Alhaji", "Mariama", "Sorie", "Kadiatu", "Osman", "Adama"];
const LAST = ["Kamara", "Sesay", "Bangura", "Conteh", "Koroma", "Turay", "Jalloh", "Mansaray", "Kargbo", "Fofanah"];

export function createDb() {
  idCounter = 0;
  const r = rng(42);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];

  const faculties: S["Faculty"][] = FACULTIES.map(([code, name, active]) => ({
    id: uuid(18), code, name, active, createdAt: iso(NOW - 300 * DAY), updatedAt: iso(NOW - 300 * DAY),
  }));
  const departments: S["Department"][] = DEPARTMENTS.map(([code, name, facultyCode, active]) => ({
    id: uuid(19), code, name, facultyId: faculties.find((f) => f.code === facultyCode)?.id ?? null, active, needsReview: facultyCode === null,
    createdAt: iso(NOW - (facultyCode ? 300 : 3) * DAY), updatedAt: iso(NOW - (facultyCode ? 300 : 3) * DAY),
  }));

  const users: S["AdminUser"][] = Object.entries(PERSONAS).map(([email, p], i) => ({
    id: uuid(1),
    email,
    authUserId: uuid(2),
    name: p.name,
    role: p.role,
    extraPermissions: [],
    departments: [...p.departments],
    faculties: [...p.faculties],
    active: true,
    lastLoginAt: iso(NOW - (i + 1) * 3_600_000),
    createdBy: i === 0 ? "cli:setup" : null,
    createdAt: iso(NOW - 120 * DAY),
    updatedAt: iso(NOW - 30 * DAY),
  }));
  users.push({
    id: uuid(1), email: "pending@unimak.test", authUserId: null, name: "Pending Invite", role: "FINANCE_OFFICER",
    extraPermissions: [], departments: [], faculties: [], active: true, lastLoginAt: null, createdBy: users[0].id,
    createdAt: iso(NOW - 2 * DAY), updatedAt: iso(NOW - 2 * DAY),
  });
  users.push({
    id: uuid(1), email: "race@unimak.test", authUserId: null, name: "Signs In Meanwhile", role: "AUDITOR",
    extraPermissions: [], departments: [], faculties: [], active: true, lastLoginAt: null, createdBy: users[0].id,
    createdAt: iso(NOW - DAY), updatedAt: iso(NOW - DAY),
  });

  const feeTypes: S["FeeType"][] = [];
  const accounts: S["FinancialAccount"][] = [];
  for (const [code, name, payerKind, recurrence] of FEE_TYPES) {
    const ft: S["FeeType"] = { id: uuid(3), code, name, payerKind, recurrence, createdAt: iso(NOW - 200 * DAY) };
    feeTypes.push(ft);
    // GRAD has no account yet: exercises "Create account" and fee activation refusal
    if (code !== "GRAD") {
      accounts.push({
        id: uuid(4), monimeId: `fac-${code.toLowerCase()}01HX`, reference: `unimak-fee-${code.toLowerCase()}`,
        name: `UNIMAK ${name}`, purpose: "FEE_TYPE", feeTypeId: ft.id, uvan: `UV${(100000 + feeTypes.length * 7919).toString()}`,
        availableBalance: null, balanceUpdatedAt: null, createdAt: iso(NOW - 200 * DAY),
      });
    }
  }
  accounts.push({
    id: uuid(4), monimeId: "fac-platform01HX", reference: "unimak-platform", name: "UNIMAK Pay platform", purpose: "PLATFORM",
    feeTypeId: null, uvan: null, availableBalance: null, balanceUpdatedAt: null, createdAt: iso(NOW - 200 * DAY),
  });

  const fees: S["Fee"][] = [];
  const rateRules: S["RateRule"][] = [];
  const eligibilityRules: S["EligibilityRule"][] = [];
  const instalmentRules: S["InstalmentRule"][] = [];
  for (const [i, ft] of feeTypes.entries()) {
    const base = FEE_TYPES[i][4];
    const period = ft.payerKind === "APPLICANT" ? "2026-SEP" : "2026/27";
    const fee: S["Fee"] = {
      id: uuid(5), feeTypeId: ft.id, name: `${ft.name} ${period}`, period, allowInstalments: ft.code === "TUITION",
      defaultMinInstalment: ft.code === "TUITION" ? "100000" : null, dueDate: ft.code === "TUITION" ? "2027-01-31" : null,
      status: ft.code === "GRAD" ? "DRAFT" : "ACTIVE", createdAt: iso(NOW - 150 * DAY),
    };
    fees.push(fee);
    if (ft.code !== "GRAD") {
      rateRules.push({ id: uuid(6), feeId: fee.id, programCode: null, department: null, level: null, residency: null, intake: null, amount: base, createdAt: fee.createdAt });
    }
    if (ft.code === "TUITION") {
      rateRules.push(
        { id: uuid(6), feeId: fee.id, programCode: null, department: null, level: null, residency: "INTERNATIONAL", intake: null, amount: "900000", createdAt: fee.createdAt },
        { id: uuid(6), feeId: fee.id, programCode: "BSC-NURS", department: null, level: null, residency: null, intake: null, amount: "520000", createdAt: fee.createdAt },
        // tie-breaker: without it an international nursing student would match two equally specific rules
        { id: uuid(6), feeId: fee.id, programCode: "BSC-NURS", department: null, level: null, residency: "INTERNATIONAL", intake: null, amount: "1000000", createdAt: fee.createdAt },
      );
      instalmentRules.push({ id: uuid(7), feeId: fee.id, department: "NURSING", level: null, minInstalment: "150000", updatedBy: users[1].id, updatedAt: iso(NOW - 20 * DAY) });
    }
    if (ft.code === "DEPT") {
      eligibilityRules.push({ id: uuid(7), feeId: fee.id, programCode: null, department: "COMPUTING", level: null, residency: null, intake: null, finalYear: null });
    }
  }
  // a closed fee from last year
  fees.push({
    id: uuid(5), feeTypeId: feeTypes[2].id, name: "Tuition 2025/26", period: "2025/26", allowInstalments: true,
    defaultMinInstalment: "100000", dueDate: "2026-01-31", status: "CLOSED", createdAt: iso(NOW - 400 * DAY),
  });

  // payments over the last 60 days
  const payments: S["AdminPaymentDetail"][] = [];
  const transfers: S["Transfer"][] = [];
  const ledger: S["LedgerEntry"][] = [];
  let receiptNo = 0;
  for (let i = 0; i < 220; i++) {
    const ftIdx = r() < 0.55 ? 2 : Math.floor(r() * 4);
    const ft = feeTypes[ftIdx];
    const fee = fees[ftIdx];
    const [programCode, department] = pick(PROGRAMS);
    const createdMs = NOW - Math.floor(r() * 60 * DAY) - 60_000;
    const roll = r();
    const status: S["PaymentStatus"] = i < 3 ? "PENDING" : roll < 0.78 ? "COMPLETED" : roll < 0.86 ? "EXPIRED" : roll < 0.93 ? "FAILED" : "PENDING";
    const full = FEE_TYPES[ftIdx][4];
    const amount = ftIdx === 2 && r() < 0.4 ? "150000" : full;
    const amt = BigInt(amount);
    const monimeFee = ((amt * 15n) / 1000n).toString();
    const platformFee = ((amt * 10n) / 1000n).toString();
    const net = (amt - BigInt(monimeFee) - BigInt(platformFee)).toString();
    const channel: S["Channel"] = r() < 0.65 ? "USSD" : "DOTS";
    const completed = status === "COMPLETED";
    const late = completed && r() < 0.05;
    const completedMs = completed ? createdMs + (late ? 40 * 60_000 : Math.floor(r() * 8 * 60_000) + 30_000) : null;
    const expiresMs = createdMs + 30 * 60_000;
    // payments no longer expire (docs/payment-lifecycle.md): what used to be "open past expiry" is now
    // PROCESSING (Monime collecting), half of them for over an hour; PENDING = awaiting payment, deleted after 7 days
    const stale = status === "PENDING" && i >= 3;
    const shown: S["PaymentStatus"] = stale ? "PROCESSING" : status;
    const pendingCreatedMs = NOW - (stale ? (i % 2 === 0 ? 180 : 30) : 10) * 60_000;
    const isApplicant = ft.payerKind === "APPLICANT";
    const ref = isApplicant ? `APP-2026-${String(1000 + i).padStart(4, "0")}` : `UNI-2025-${String(i).padStart(4, "0")}`;
    const id = uuid(8);
    const orderNumber = completed ? `3BMR${Math.floor(r() * 36 ** 6).toString(36).toUpperCase().padStart(6, "0")}QX` : null;
    // by transfer count, not payment index, so a few FAILED / SUBMITTED transfers always exist
    const tn = transfers.length;
    const tFailed = tn % 23 === 7;
    const tStuck = tn % 29 === 11;
    const transfer: S["Transfer"] | null = completed
      ? {
          id: uuid(9), kind: "COMMISSION", paymentId: id, sourceAccount: `fac-${ft.code.toLowerCase()}01HX`, destinationAccount: "fac-platform01HX",
          amount: platformFee, status: tFailed ? "FAILED" : tStuck ? "SUBMITTED" : "COMPLETED", attempt: 1,
          monimeTransferId: `trn-${id.slice(-8)}`, failureCode: tFailed ? "insufficient_funds" : null,
          failureMessage: tFailed ? "Source account balance too low at the time of transfer" : null,
          createdAt: iso(completedMs!), updatedAt: iso(completedMs! + 5000), completedAt: tFailed || tStuck ? null : iso(completedMs! + 5000),
        }
      : null;
    if (transfer) transfers.push(transfer);
    const entry: S["LedgerEntry"] | null = completed
      ? { id: uuid(10), obligationId: uuid(11), type: "PAYMENT", amount: `-${amount}`, paymentId: id, memo: `Monime ${orderNumber}`, createdBy: "system", createdAt: iso(completedMs!) }
      : null;
    if (entry) ledger.push(entry);
    payments.push({
      id, obligationId: entry?.obligationId ?? uuid(11), amount, channel, clientId: channel === "DOTS" ? "dash-dots" : "ussd",
      idempotencyKey: `idem-${id.slice(-8)}`, paymentRef: String(15_000_000 + Math.floor(r() * 84_999_999)),
      payerPhone: completed ? (r() < 0.5 ? `+23276****${String(10 + Math.floor(r() * 89))}` : `+2327${Math.floor(1_000_000 + r() * 8_999_999)}`) : null,
      phoneAuthorized: false, collectionMethod: channel === "USSD" ? "USSD_FLOW" : "PAYMENT_CODE", status: shown,
      monimeRef: `pmc-${id.slice(-10)}`, ussdCode: status === "PENDING" ? "*715*1*7344331308#" : null,
      monimePaymentId: completed || stale ? `spm-${id.slice(-10)}` : null, monimeOrderNumber: orderNumber,
      pricingConfigId: uuid(12), monimeFee, platformFee, netAmount: net,
      // PENDING: deleted if unpaid 7 days after it was made; older rows keep their old 15-minute expiry
      expiresAt: iso(status === "PENDING" ? pendingCreatedMs + 7 * DAY : expiresMs),
      processingAt: stale ? iso(pendingCreatedMs + 2 * 60_000) : completedMs ? iso(completedMs - 20_000) : null,
      completedAt: completedMs ? iso(completedMs) : null,
      failureReason: status === "FAILED" ? pick(["Payer cancelled", "Insufficient balance", "Payment code expired at Monime"]) : null,
      createdAt: iso(status === "PENDING" ? pendingCreatedMs : createdMs),
      updatedAt: iso(completedMs ?? (status === "PENDING" ? pendingCreatedMs : createdMs)),
      payRequestId: null, paidByName: null, payingForSelf: false, monimeChannelType: completed ? (channel === "USSD" ? "momo" : "wallet") : null,
      feeTypeCode: ft.code, feeName: fee.name,
      // names are filled in by the handlers from the current departments/faculties
      payer: { kind: ft.payerKind, ref, fullName: `${pick(FIRST)} ${pick(LAST)}`, programCode, department, departmentName: null, facultyCode: null, facultyName: null },
      receiptNumber: completed ? `UNIMAK-2026-${String(++receiptNo).padStart(6, "0")}` : null,
      ledgerEntry: entry, commissionTransfer: transfer,
    });
  }
  payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

  // balances: what was collected net of fees minus payouts
  const payouts: S["Payout"][] = [];
  for (const [i, a] of accounts.entries()) {
    if (a.purpose !== "FEE_TYPE") continue;
    const collected = payments
      .filter((p) => p.status === "COMPLETED" && `unimak-fee-${p.feeTypeCode.toLowerCase()}` === a.reference)
      .reduce((s, p) => s + BigInt(p.netAmount), 0n);
    const paidOut = (collected * 6n) / 10n;
    a.availableBalance = (collected - paidOut).toString();
    a.balanceUpdatedAt = iso(NOW - (i + 1) * 900_000);
    if (paidOut > 0n) {
      payouts.push({
        id: uuid(13), financialAccountId: a.id, amount: paidOut.toString(), destinationType: "bank", providerId: "slb001",
        accountNumber: "0012345678901", accountName: "University of Makeni", narration: `${a.name} sweep`, status: "COMPLETED",
        monimePayoutId: `pyt-${a.id.slice(-8)}`, fees: "2500", failureCode: null, failureMessage: null, requestedBy: users[0].id,
        idempotencyKey: `seed-${a.id.slice(-8)}`, createdAt: iso(NOW - (10 + i) * DAY), updatedAt: iso(NOW - (10 + i) * DAY + 600_000),
        completedAt: iso(NOW - (10 + i) * DAY + 600_000),
      });
    }
  }
  const platform = accounts.find((a) => a.purpose === "PLATFORM")!;
  platform.availableBalance = transfers.filter((t) => t.status === "COMPLETED").reduce((s, t) => s + BigInt(t.amount), 0n).toString();
  platform.balanceUpdatedAt = iso(NOW - 600_000);
  payouts.push(
    {
      id: uuid(13), financialAccountId: accounts[2].id, amount: "1250000", destinationType: "bank", providerId: "rcb001",
      accountNumber: "5500112233", accountName: "UNIMAK Capital Works", narration: "Library roof", status: "FAILED",
      monimePayoutId: "pyt-failed01", fees: null, failureCode: "account_name_mismatch", failureMessage: "Destination account name does not match",
      requestedBy: users[0].id, idempotencyKey: "seed-failed", createdAt: iso(NOW - 2 * DAY), updatedAt: iso(NOW - 2 * DAY + 300_000), completedAt: null,
    },
    {
      id: uuid(13), financialAccountId: accounts[2].id, amount: "300000", destinationType: "bank", providerId: "slb001",
      accountNumber: "0012345678901", accountName: "University of Makeni", narration: "Weekly sweep", status: "PROCESSING",
      monimePayoutId: "pyt-proc01", fees: null, failureCode: null, failureMessage: null, requestedBy: users[0].id,
      idempotencyKey: "seed-proc", createdAt: iso(NOW - 3 * 3_600_000), updatedAt: iso(NOW - 3 * 3_600_000), completedAt: null,
    },
  );
  payouts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  transfers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const outbox: S["OutboxMessage"][] = payments
    .filter((p) => p.status === "COMPLETED")
    .slice(0, 40)
    .map((p, i) => ({
      id: uuid(14), type: i % 3 === 0 ? "portal.application_paid" : "sms.receipt", dedupeKey: `sms.receipt:${p.id}`,
      payload: { paymentId: p.id, receiptNumber: p.receiptNumber }, status: i === 4 || i === 17 ? "DEAD" : "SENT",
      attempts: i === 4 || i === 17 ? 8 : 1, nextAttemptAt: p.completedAt!, lockedUntil: null,
      lastError: i === 4 || i === 17 ? "portal responded 502 Bad Gateway" : null, createdAt: p.completedAt!, sentAt: i === 4 || i === 17 ? null : p.completedAt!,
    }));

  const runs: S["ReconciliationRun"][] = [];
  const items: S["ReconciliationItem"][] = [];
  for (let d = 1; d <= 14; d++) {
    const start = Date.parse(new Date(NOW - d * DAY).toISOString().slice(0, 10) + "T00:00:00Z");
    const run: S["ReconciliationRun"] = {
      id: uuid(15), windowStart: iso(start), windowEnd: iso(start + DAY), status: d === 9 ? "FAILED" : "COMPLETED", triggeredBy: "cron",
      startedAt: iso(start + DAY + 3_600_000), finishedAt: iso(start + DAY + 3_660_000),
      stats: { monimePayments: 12 + d, matched: 11 + d, autoSettled: d === 2 ? 1 : 0, flagged: d === 1 || d === 3 ? 2 : 0 },
      error: d === 9 ? "Monime list payments: 503 Service Unavailable" : null,
    };
    runs.push(run);
    if (d === 1 || d === 3) {
      items.push(
        {
          id: uuid(16), runId: run.id, kind: "UNMATCHED_MONIME_PAYMENT", status: "OPEN", paymentId: null, monimePaymentId: `spm-orphan${d}`,
          transferId: null, financialAccountId: accounts[2].monimeId, expected: null, actual: { amount: "450000", metadata: {} },
          note: "Monime payment with no matching UNIMAK payment", resolvedAt: null, resolvedBy: null, resolution: null, createdAt: run.finishedAt!,
        },
        {
          id: uuid(16), runId: run.id, kind: "COMMISSION_NOT_COMPLETED", status: d === 3 ? "RESOLVED" : "OPEN", paymentId: payments[10].id,
          monimePaymentId: payments[10].monimePaymentId, transferId: transfers[0]?.id ?? null, financialAccountId: null,
          expected: { status: "COMPLETED" }, actual: { status: "FAILED" }, note: "Commission transfer did not complete",
          resolvedAt: d === 3 ? iso(NOW - DAY) : null, resolvedBy: d === 3 ? users[1].id : null, resolution: d === 3 ? "Retried manually, completed" : null,
          createdAt: run.finishedAt!,
        },
      );
    }
    if (d === 2) {
      items.push({
        id: uuid(16), runId: run.id, kind: "MISSED_WEBHOOK_SETTLED", status: "AUTO_RESOLVED", paymentId: payments[20].id,
        monimePaymentId: payments[20].monimePaymentId, transferId: null, financialAccountId: null, expected: null, actual: { status: "completed" },
        note: "Payment completed at Monime; webhook never arrived. Settled.", resolvedAt: run.finishedAt, resolvedBy: "cron", resolution: "auto", createdAt: run.finishedAt!,
      });
    }
  }

  const webhookEvents: S["WebhookEvent"][] = Array.from({ length: 30 }, (_, i) => {
    const status: S["WebhookEventStatus"] = i === 2 ? "UNMATCHED" : i === 5 ? "FAILED" : i % 7 === 0 ? "IGNORED" : "PROCESSED";
    const t = NOW - i * 5 * 3_600_000;
    return {
      id: `evt-01JD${(900000 + i).toString(36).toUpperCase()}`,
      type: i % 7 === 0 ? "payment_code.created" : i === 5 ? "payout.completed" : "payment.processing_completed",
      payload: {
        apiVersion: "caph.2025-08-23",
        event: { id: `evt-${i}`, name: "payment.processing_completed", timestamp: iso(t) },
        data: { id: `spm-${(i * 7919).toString(36)}`, amount: { currency: "SLE", value: 450000 }, metadata: i === 2 ? {} : { paymentRef: "15540719" } },
      },
      status, attempts: status === "FAILED" ? 3 : 1, error: i === 2 ? "No payment matches metadata.paymentRef" : i === 5 ? "Payout not found" : null,
      receivedAt: iso(t), processedAt: status === "FAILED" ? null : iso(t + 400), resolvedAt: null, resolvedBy: null, resolution: null,
    };
  });

  const pendingUser = users.find((u) => u.email === "pending@unimak.test")!;
  const audit: S["AuditLog"][] = [
    ...payouts.slice(0, 4).map((p) => ({
      id: uuid(17), actorId: users[0].id, action: "payout.create", entity: "Payout", entityId: p.id, before: null,
      after: { amount: p.amount, status: "REQUESTED", accountNumber: p.accountNumber }, at: p.createdAt,
    })),
    {
      id: uuid(17), actorId: users[1].id, action: "fee.update", entity: "Fee", entityId: fees[2].id,
      before: { status: "DRAFT", allowInstalments: false }, after: { status: "ACTIVE", allowInstalments: true }, at: iso(NOW - 40 * DAY),
    },
    {
      id: uuid(17), actorId: users[0].id, action: "user.create", entity: "AdminUser", entityId: pendingUser.id, before: null,
      after: { email: pendingUser.email, role: pendingUser.role }, at: pendingUser.createdAt,
    },
  ].sort((a, b) => b.at.localeCompare(a.at));

  const banks: S["Bank"][] = [
    { providerId: "slb001", name: "Sierra Leone Commercial Bank", active: true, canPayTo: true },
    { providerId: "rcb001", name: "Rokel Commercial Bank", active: true, canPayTo: true },
    { providerId: "ecb001", name: "Ecobank Sierra Leone", active: true, canPayTo: true },
    { providerId: "uba001", name: "UBA Sierra Leone", active: false, canPayTo: false },
  ];

  const obligations = seedObligations(fees, feeTypes, rateRules);
  // a level rule (added last so earlier fixture ids don't shift): final-year nursing students pay at least 1,200 per instalment
  const tuition = fees.find((f) => f.name === "Tuition 2026/27")!;
  instalmentRules.push({ id: uuid(7), feeId: tuition.id, department: "NURSING", level: 4, minInstalment: "120000", updatedBy: users[1].id, updatedAt: iso(NOW - 10 * DAY) });

  const needsReview = seedNeedsReview(fees);
  const portalEvents = seedPortalEvents();
  const roster = seedRoster(fees, feeTypes, rateRules);

  // Payment lifecycle (added last so earlier fixture ids don't shift): two unpaid payments the cleanup removed,
  // and a payment Monime then completed for one of them, which comes back UNMATCHED for a person.
  const deletedPayments = [
    { id: uuid(28), paymentRef: "15999001", amount: "450000", reason: "retention", at: NOW - 2 * DAY },
    { id: uuid(28), paymentRef: "15999002", amount: "150000", reason: "another payment for this fee completed (30000123)", at: NOW - 5 * 3_600_000 },
  ];
  for (const d of deletedPayments) {
    audit.push({
      id: uuid(17), actorId: "system", action: "payment.delete_awaiting", entity: "Payment", entityId: d.id,
      before: { paymentRef: d.paymentRef, obligationId: uuid(11), amount: d.amount, status: "PENDING", channel: "USSD", createdAt: iso(d.at - 7 * DAY), monimeRef: `pmc-${d.id.slice(-10)}` },
      after: { reason: d.reason }, at: iso(d.at),
    });
  }
  audit.sort((a, b) => b.at.localeCompare(a.at));
  webhookEvents.unshift({
    id: "evt-01JDDELETED1", type: "payment.processing_completed",
    payload: { apiVersion: "caph.2025-08-23", event: { id: "evt-deleted", name: "payment.processing_completed", timestamp: iso(NOW - 3_600_000) }, data: { id: "spm-late000001", amount: { currency: "SLE", value: 450000 }, metadata: { paymentRef: "15999001" } } },
    status: "UNMATCHED", attempts: 1,
    error: `UNIMAK payment 15999001 not found (deleted while awaiting payment?); Monime spm-late000001 for obligation ${uuid(11)}: apply or refund by hand`,
    receivedAt: iso(NOW - 3_600_000), processedAt: iso(NOW - 3_600_000 + 400), resolvedAt: null, resolvedBy: null, resolution: null,
  });

  // the migration's placeholder exam-clearance rule, until the finance office sets the real one
  const clearancePolicy: S["ClearancePolicy"] = {
    id: "current", examName: "First semester exams", period: "2026/27", feeTypeCodes: ["TUITION"], includeOverdue: true, placeholder: true,
    updatedBy: "system:migration", updatedAt: iso(NOW - 3 * DAY),
  };

  return { faculties, departments, users, feeTypes, accounts, fees, rateRules, eligibilityRules, instalmentRules, payments, transfers, ledger, payouts, outbox, runs, items, webhookEvents, audit, banks, obligations, needsReview, portalEvents, roster, deletedPayments, clearancePolicy };
}

/** A payer's profile as the backend matches it against rules. */
export type PayerProfile = {
  kind: S["PayerKind"];
  programCode: string;
  department: string | null;
  level: number | null;
  residency: S["Residency"];
  intake: string;
  finalYear: boolean | null;
};

/**
 * Obligations exist only for re-pricing (GET/POST /fees/{id}/reprice); nothing else lists them.
 * `entryTypes` is the ledger entry types on the obligation, `paymentInProgress` an unexpired
 * INITIATED/PENDING payment. Seeded after everything else, with their own RNG, so the other
 * fixtures (ids, payments) don't shift.
 */
export type MockObligation = {
  id: string;
  feeId: string;
  payer: { kind: "applicant" | "student"; ref: string; fullName: string };
  profile: PayerProfile;
  status: "OPEN" | "PAID";
  amount: string;
  rateRuleId: string | null;
  entryTypes: string[];
  paymentInProgress: boolean;
};

function seedObligations(fees: S["Fee"][], feeTypes: S["FeeType"][], rateRules: S["RateRule"][]): MockObligation[] {
  const r = rng(7);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const out: MockObligation[] = [];
  const priced = (feeId: string, p: PayerProfile) => {
    const m = rateRules
      .filter(
        (x) =>
          x.feeId === feeId &&
          (!x.programCode || x.programCode === p.programCode) &&
          (!x.department || x.department === p.department) &&
          (x.level == null || x.level === p.level) &&
          (!x.residency || x.residency === p.residency) &&
          (!x.intake || x.intake === p.intake),
      )
      .sort((a, b) => [b.programCode, b.department, b.level, b.residency, b.intake].filter((v) => v != null).length - [a.programCode, a.department, a.level, a.residency, a.intake].filter((v) => v != null).length);
    return m[0];
  };
  const add = (
    feeCode: string,
    n: number,
    [programCode, department]: readonly [string, string],
    o: { residency?: S["Residency"]; status?: "OPEN" | "PAID"; entryTypes?: string[]; paymentInProgress?: boolean } = {},
  ) => {
    const ftIdx = feeTypes.findIndex((t) => t.code === feeCode);
    const fee = fees[ftIdx];
    const level = 1 + Math.floor(r() * 4);
    const profile: PayerProfile = { kind: "STUDENT", programCode, department, level, residency: o.residency ?? "LOCAL", intake: "2025-SEP", finalYear: level === 4 };
    const rule = priced(fee.id, profile);
    out.push({
      id: uuid(20), feeId: fee.id, payer: { kind: "student", ref: `UNI-2025-${String(500 + n).padStart(4, "0")}`, fullName: `${pick(FIRST)} ${pick(LAST)}` },
      profile, status: o.status ?? "OPEN", amount: rule?.amount ?? "0", rateRuleId: rule?.id ?? null,
      entryTypes: o.entryTypes ?? ["CHARGE"], paymentInProgress: o.paymentInProgress ?? false,
    });
  };
  const [CS, IT, ECON, NURS, LAW] = PROGRAMS;
  // Tuition: everyone at the current price; every skip reason that can arise from data.
  add("TUITION", 1, CS);
  add("TUITION", 2, IT);
  add("TUITION", 3, ECON);
  add("TUITION", 4, LAW);
  add("TUITION", 5, CS, { residency: "INTERNATIONAL" });
  add("TUITION", 6, NURS);
  add("TUITION", 7, NURS, { residency: "INTERNATIONAL" });
  add("TUITION", 8, CS, { status: "PAID", entryTypes: ["CHARGE", "PAYMENT"] });
  add("TUITION", 9, ECON, { entryTypes: ["CHARGE", "PAYMENT"] });
  add("TUITION", 10, IT, { paymentInProgress: true });
  // Department levy (eligibility: Computer Science only): nothing to change, one no longer eligible.
  add("DEPT", 11, CS);
  add("DEPT", 12, CS);
  add("DEPT", 13, ECON);
  return out;
}

/** Students the portal marked SUSPENDED / WITHDRAWN / GRADUATED who still owe something, newest status first. */
function seedNeedsReview(fees: S["Fee"][]): S["NeedsReviewPayer"][] {
  const r = rng(11);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const tuition = fees.find((f) => f.name === "Tuition 2026/27")!;
  const levy = fees.find((f) => f.name === "Department levy 2026/27")!;
  const lastYear = fees.find((f) => f.name === "Tuition 2025/26")!;
  const rows: [string, number, S["NeedsReviewPayer"]["enrolmentStatus"], { fee: S["Fee"]; amount: string; balance: string }[]][] = [
    ["COMPUTING", 2, "SUSPENDED", [{ fee: tuition, amount: "450000", balance: "300000" }]],
    ["COMPUTING", 4, "GRADUATED", [{ fee: lastYear, amount: "450000", balance: "50000" }, { fee: levy, amount: "30000", balance: "30000" }]],
    ["INFO-TECH", 1, "WITHDRAWN", [{ fee: tuition, amount: "450000", balance: "450000" }]],
    ["ECONOMICS", 3, "SUSPENDED", [{ fee: tuition, amount: "450000", balance: "125050" }]],
    ["NURSING", 2, "WITHDRAWN", [{ fee: tuition, amount: "520000", balance: "520000" }]],
    ["NURSING", 4, "GRADUATED", [{ fee: lastYear, amount: "520000", balance: "20000" }]],
    ["LAW", 1, "SUSPENDED", [{ fee: tuition, amount: "450000", balance: "450000" }]],
    ["COMPUTING", 3, "WITHDRAWN", [{ fee: tuition, amount: "450000", balance: "150000" }]],
  ];
  return rows.map(([department, level, enrolmentStatus, obs], i) => {
    const obligations = obs.map((o) => ({ id: uuid(21), feeName: o.fee.name, period: o.fee.period, amount: o.amount, balance: o.balance }));
    return {
      id: uuid(22), ref: `UNI-2024-${String(700 + i).padStart(4, "0")}`, fullName: `${pick(FIRST)} ${pick(LAST)}`, department, level, enrolmentStatus,
      statusSince: iso(NOW - (i * 3 + 1) * DAY), obligations,
      totalBalance: obligations.reduce((sum, o) => sum + BigInt(o.balance), 0n).toString(),
    };
  });
}

/**
 * What the portal pushed, newest first. Times are relative to the real clock (not NOW) so the
 * "last update from the portal" badge reads "5 min ago": the newest event is APPLIED 5 minutes ago.
 */
function seedPortalEvents(): S["PortalEvent"][] {
  const r = rng(13);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const start = Date.now() - 5 * 60_000;
  const out: S["PortalEvent"][] = [];
  for (let i = 0; i < 70; i++) {
    const student = i % 3 !== 2;
    const ref = student ? `UNI-2025-${String(100 + (i % 40)).padStart(4, "0")}` : `APP-2026-${String(2000 + i).padStart(4, "0")}`;
    const result: S["PortalEventResult"] = i === 0 ? "APPLIED" : i % 11 === 4 ? "REJECTED" : i % 7 === 3 ? "STALE" : "APPLIED";
    const [programCode, department] = pick(PROGRAMS);
    const receivedMs = start - i * 37 * 60_000;
    const updatedAt = iso(receivedMs - 20_000);
    const phone = result === "REJECTED" && i % 2 === 0 ? "076100001" : `+2327610${String(i).padStart(4, "0")}`;
    const data = student
      ? { studentId: ref, fullName: `${pick(FIRST)} ${pick(LAST)}`, phone, programCode, department, level: 1 + (i % 4), finalYear: i % 4 === 3, residency: "LOCAL", intake: "2025-SEP", enrolmentStatus: i % 13 === 5 ? "SUSPENDED" : "ACTIVE", updatedAt }
      : { applicationRef: ref, fullName: `${pick(FIRST)} ${pick(LAST)}`, phone, programCode, department, intake: "2026-SEP", residency: "LOCAL", status: "APPLIED", updatedAt };
    out.push({
      id: `evt-${String(5000 - i)}`, type: student ? "student.upserted" : "applicant.upserted", ref, result,
      error: result !== "REJECTED" ? null : phone.startsWith("+") ? "department must be a known department code" : "phone must match ^\\+\\d{8,15}$",
      data, occurredAt: iso(receivedMs - 15_000), receivedAt: iso(receivedMs),
    });
  }
  return out;
}

type PD = S["PayerDetail"];
/** A payer's record; department/faculty names are filled in by the handlers from the current departments. */
export type RosterPayer = PD["payer"];
export type RosterObligation = Omit<PD["obligations"][number], "fee" | "billed" | "collected" | "balance" | "overdue" | "minInstalment"> & {
  payerId: string;
  feeId: string;
};
export type RosterReceipt = PD["receipts"][number] & { payerId: string };
export type Roster = { payers: RosterPayer[]; obligations: RosterObligation[]; receipts: RosterReceipt[]; payments: S["AdminPaymentDetail"][] };

/**
 * The student roster behind the outstanding report, the payer list and payer detail: about a
 * hundred students across department × level with tuition (this year and, from level 2, last
 * year's, due 2026-01-31 so unpaid balances are overdue), the Computer Science levy and
 * matriculation for level 1; some suspended/withdrawn students; three active students with no
 * obligations (NOT_BILLED); applicants with the application fee. Payments here are their own
 * (`payments`), looked up by payment detail but not listed with the others.
 */
function seedRoster(fees: S["Fee"][], feeTypes: S["FeeType"][], rateRules: S["RateRule"][]): Roster {
  const r = rng(17);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const fee = (name: string) => fees.find((f) => f.name === name)!;
  const tuition = fee("Tuition 2026/27");
  const lastYear = fee("Tuition 2025/26");
  const levy = fee("Department levy 2026/27");
  const matric = fee("Matriculation 2026/27");
  const app = fee("Application fee 2026-SEP");
  const typeOf = (f: S["Fee"]) => feeTypes.find((t) => t.id === f.feeTypeId)!;
  // last year's (closed) tuition has no rules of its own: priced like this year's
  const ruleFor = (f: S["Fee"], programCode: string, residency: S["Residency"]) => {
    const priced = f === lastYear ? tuition : f;
    const m = rateRules.filter((x) => x.feeId === priced.id && (!x.programCode || x.programCode === programCode) && (!x.residency || x.residency === residency));
    return m.sort((a, b) => [b.programCode, b.residency].filter(Boolean).length - [a.programCode, a.residency].filter(Boolean).length)[0] ?? null;
  };

  const payers: RosterPayer[] = [];
  const obligations: RosterObligation[] = [];
  const receipts: RosterReceipt[] = [];
  const payments: S["AdminPaymentDetail"][] = [];
  let paymentNo = 0;

  const phone = () => `+23276${String(100000 + Math.floor(r() * 899999))}`;
  const payer = (o: Partial<RosterPayer> & Pick<RosterPayer, "kind" | "ref" | "programCode" | "department">): RosterPayer => {
    const p: RosterPayer = {
      id: uuid(23), fullName: `${pick(FIRST)} ${pick(LAST)}`, phone: phone(), departmentName: null, facultyCode: null, facultyName: null,
      level: null, finalYear: null, residency: "LOCAL", intake: "2025-SEP", applicantStatus: null, enrolmentStatus: null, applicationRef: null,
      portalUpdatedAt: iso(NOW - Math.floor(r() * 30) * DAY - 3_600_000), snapshotAt: iso(NOW - 90 * DAY), email: null, ...o,
    };
    // the portal gives an email for most (from the name, not the RNG, so the rest of the roster stays put); every fifth has none
    if (o.email === undefined && payers.length % 5 !== 4) p.email = `${p.fullName.toLowerCase().replace(/\s+/g, ".")}${payers.length}@gmail.com`;
    payers.push(p);
    return p;
  };

  /** One obligation: the charge, then `paid` (0..1 of the amount) in one or two completed payments, plus noise. */
  const bill = (p: RosterPayer, f: S["Fee"], paid: number, o: { adjust?: string; refund?: boolean; failed?: boolean } = {}) => {
    const ft = typeOf(f);
    const rule = ruleFor(f, p.programCode, p.residency);
    const amount = BigInt(rule?.amount ?? "0");
    const created = Date.parse(f.createdAt) + Math.floor(r() * 5) * DAY;
    const ob: RosterObligation = {
      id: uuid(24), payerId: p.id, feeId: f.id, status: "OPEN", amount: amount.toString(), rateRuleId: f === lastYear ? null : (rule?.id ?? null), createdAt: iso(created),
      entries: [{ id: uuid(25), type: "CHARGE", amount: amount.toString(), memo: null, paymentId: null, createdBy: "system", createdAt: iso(created) }],
      payments: [],
    };
    let balance = amount;
    if (o.adjust) {
      balance += BigInt(o.adjust);
      ob.entries.push({ id: uuid(25), type: "ADJUSTMENT", amount: o.adjust, memo: "Bursary award", paymentId: null, createdBy: "bursar@unimak.test", createdAt: iso(created + 2 * DAY) });
    }
    // round to whole leones, split in two when large
    let toPay = paid >= 1 ? balance : (BigInt(Math.round(Number(balance) * paid)) / 100n) * 100n;
    const parts = toPay > 200000n && r() < 0.6 ? [toPay / 2n, toPay - toPay / 2n] : toPay > 0n ? [toPay] : [];
    const pay = (amt: bigint, at: number, status: S["PaymentStatus"]) => {
      paymentNo++;
      const id = uuid(26);
      const completed = status === "COMPLETED";
      const channel: S["Channel"] = r() < 0.65 ? "USSD" : "DOTS";
      const receiptNumber = completed ? `UNIMAK-2026-${String(500000 + paymentNo)}` : null;
      const entry = completed
        ? { id: uuid(25), type: "PAYMENT" as const, amount: (-amt).toString(), memo: `Monime 3BMR${String(paymentNo).padStart(6, "0")}QX`, paymentId: id, createdBy: "system", createdAt: iso(at + 240_000) }
        : null;
      if (entry) ob.entries.push(entry);
      const a = amt.toString();
      const fee15 = ((amt * 15n) / 1000n).toString();
      const fee10 = ((amt * 10n) / 1000n).toString();
      payments.push({
        id, obligationId: ob.id, amount: a, channel, clientId: channel === "DOTS" ? "dash-dots" : "ussd", idempotencyKey: `idem-${id.slice(-8)}`,
        paymentRef: String(30_000_000 + paymentNo), payerPhone: p.phone, phoneAuthorized: false,
        collectionMethod: channel === "USSD" ? "USSD_FLOW" : "PAYMENT_CODE", status, monimeRef: `pmc-${id.slice(-10)}`, ussdCode: null,
        monimePaymentId: completed ? `spm-${id.slice(-10)}` : null, monimeOrderNumber: completed ? `3BMR${String(paymentNo).padStart(6, "0")}QX` : null,
        pricingConfigId: uuid(12), monimeFee: fee15, platformFee: fee10, netAmount: (amt - BigInt(fee15) - BigInt(fee10)).toString(),
        expiresAt: iso(at + 30 * 60_000), processingAt: completed ? iso(at + 220_000) : null, completedAt: completed ? iso(at + 240_000) : null,
        payRequestId: null, paidByName: null, payingForSelf: true, monimeChannelType: completed ? "momo" : null,
        failureReason: status === "FAILED" ? "Insufficient balance" : null, createdAt: iso(at), updatedAt: iso(at + 240_000),
        feeTypeCode: ft.code, feeName: f.name,
        payer: { kind: p.kind, ref: p.ref, fullName: p.fullName, programCode: p.programCode, department: p.department, departmentName: null, facultyCode: null, facultyName: null },
        receiptNumber, ledgerEntry: entry ? { ...entry, obligationId: ob.id } : null, commissionTransfer: null,
      });
      ob.payments.unshift({
        id, paymentRef: String(30_000_000 + paymentNo), amount: a, status, channel, collectionMethod: channel === "USSD" ? "USSD_FLOW" : "PAYMENT_CODE",
        payerPhone: p.phone, createdAt: iso(at), completedAt: completed ? iso(at + 240_000) : null,
        failureReason: status === "FAILED" ? "Insufficient balance" : null, receiptNumber,
      });
      if (receiptNumber) receipts.push({ id: uuid(27), number: receiptNumber, amount: a, issuedAt: iso(at + 245_000), obligationId: ob.id, paymentId: id, payerId: p.id });
    };
    let at = created + DAY;
    if (o.failed) pay(toPay > 0n ? parts[0] : balance, at - 3_600_000, "FAILED");
    for (const part of parts) {
      at += Math.floor(1 + r() * 20) * DAY;
      pay(part, Math.min(at, NOW - DAY), "COMPLETED");
    }
    balance -= toPay;
    if (o.refund && toPay > 0n) {
      const back = toPay < 50000n ? toPay : 50000n;
      ob.entries.push({ id: uuid(25), type: "REFUND", amount: back.toString(), memo: "Paid twice: refunded", paymentId: ob.payments[0]?.id ?? null, createdBy: "bursar@unimak.test", createdAt: iso(Math.min(at + DAY, NOW - 3_600_000)) });
      balance += back;
      toPay -= back;
    }
    ob.status = balance <= 0n ? "PAID" : "OPEN";
    obligations.push(ob);
  };
  /** how much of a fee a student has paid: in full, part, nothing */
  const share = () => {
    const x = r();
    return x < 0.45 ? 1 : x < 0.75 ? 0.2 + r() * 0.6 : 0;
  };

  // [program, department, levels]: Mass Communication is new (levels 1–2 only)
  const cohorts: [string, string, number[]][] = [
    ["BSC-CS", "COMPUTING", [1, 2, 3, 4]],
    ["BSC-IT", "INFO-TECH", [1, 2, 3, 4]],
    ["BA-ECON", "ECONOMICS", [1, 2, 3, 4]],
    ["BSC-NURS", "NURSING", [1, 2, 3, 4]],
    ["LLB", "LAW", [1, 2, 3, 4]],
    ["BA-MC", "MASS-COMM", [1, 2]],
  ];
  let n = 100;
  for (const [programCode, department, levels] of cohorts) {
    for (const level of levels) {
      const count = 2 + Math.floor(r() * 4);
      for (let i = 0; i < count; i++) {
        const p = payer({
          kind: "STUDENT", ref: `UNI-2025-${String(n++).padStart(4, "0")}`, programCode, department, level, finalYear: level === 4,
          residency: r() < 0.1 ? "INTERNATIONAL" : "LOCAL", intake: `${2026 - level}-SEP`, enrolmentStatus: "ACTIVE",
        });
        bill(p, tuition, share(), { adjust: r() < 0.06 ? "-100000" : undefined, refund: r() < 0.03, failed: r() < 0.08 });
        if (department === "COMPUTING") bill(p, levy, share());
        if (level === 1) bill(p, matric, r() < 0.7 ? 1 : 0);
        // last year's tuition: mostly settled; what isn't is overdue (due 2026-01-31)
        if (level >= 2) bill(p, lastYear, r() < 0.75 ? 1 : 0.3 + r() * 0.5);
      }
    }
  }
  // the hundredth student came in from an application: linked both ways
  const linkedApp = `APP-2025-${String(4100).padStart(4, "0")}`;
  payers[0].applicationRef = linkedApp;

  // active but nothing billed (usually a missing rate rule)
  for (const [programCode, department, level] of [["BA-MC", "MASS-COMM", 3], ["BA-MC", "MASS-COMM", 3], ["LLB", "LAW", 2]] as const) {
    payer({ kind: "STUDENT", ref: `UNI-2025-${String(n++).padStart(4, "0")}`, programCode, department, level, finalYear: false, enrolmentStatus: "ACTIVE" });
  }
  // not active: only counted with includeInactive (they're in Needs review)
  for (const [programCode, department, level, enrolmentStatus] of [
    ["BSC-CS", "COMPUTING", 2, "SUSPENDED"],
    ["BSC-IT", "INFO-TECH", 3, "WITHDRAWN"],
    ["BA-ECON", "ECONOMICS", 1, "SUSPENDED"],
    ["BSC-NURS", "NURSING", 4, "GRADUATED"],
    ["LLB", "LAW", 3, "WITHDRAWN"],
  ] as const) {
    const p = payer({ kind: "STUDENT", ref: `UNI-2025-${String(n++).padStart(4, "0")}`, programCode, department, level, finalYear: level === 4, enrolmentStatus });
    bill(p, tuition, r() < 0.5 ? 0 : 0.4);
  }

  // applicants: the application fee, by status
  payer({ kind: "APPLICANT", ref: linkedApp, programCode: payers[0].programCode, department: payers[0].department, intake: "2025-SEP", applicantStatus: "ADMITTED", fullName: payers[0].fullName, phone: payers[0].phone, email: payers[0].email });
  const statuses = ["APPLIED", "APPLIED", "APPLIED", "ADMITTED", "ADMITTED", "REJECTED", "WITHDRAWN"] as const;
  for (let i = 0; i < 14; i++) {
    const [programCode, department] = pick(PROGRAMS);
    const status = statuses[i % statuses.length];
    const p = payer({ kind: "APPLICANT", ref: `APP-2026-${String(3000 + i).padStart(4, "0")}`, programCode, department, intake: "2026-SEP", applicantStatus: status });
    bill(p, app, status === "ADMITTED" || r() < 0.6 ? 1 : 0);
  }
  return { payers, obligations, receipts, payments };
}
