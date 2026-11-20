/**
 * SLE money. The API sends amounts as strings of minor units (1 SLE = 100 cents).
 * Never use JS numbers for money: everything here is BigInt or string math.
 */

const MINOR_RE = /^-?\d+$/;
/** What the API accepts as a positive amount (`MinorAmount` in openapi.yaml). */
const API_MINOR_RE = /^[1-9]\d{0,17}$/;

function toBigInt(minor: string | bigint): bigint {
  if (typeof minor === "bigint") return minor;
  const s = minor.trim();
  if (!MINOR_RE.test(s)) throw new Error(`Not a minor-unit amount: ${JSON.stringify(minor)}`);
  return BigInt(s);
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** `"150000"` → `"SLE 1,500.00"`, `"-5"` → `"-SLE 0.05"`. */
export function formatSle(minor: string | bigint): string {
  return `${toBigInt(minor) < 0n ? "-" : ""}SLE ${formatSleNumber(minor, { abs: true })}`;
}

/** The number part only: `"150000"` → `"1,500.00"` (for tables with an SLE column header). */
export function formatSleNumber(minor: string | bigint, opts: { abs?: boolean } = {}): string {
  const v = toBigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const major = groupThousands((abs / 100n).toString());
  const cents = (abs % 100n).toString().padStart(2, "0");
  return `${neg && !opts.abs ? "-" : ""}${major}.${cents}`;
}

/** A difference: `"5000"` → `"+SLE 50.00"`, `"-5000"` → `"-SLE 50.00"`, `"0"` → `"SLE 0.00"`. */
export function formatSleSigned(minor: string | bigint): string {
  return `${toBigInt(minor) > 0n ? "+" : ""}${formatSle(minor)}`;
}

/** Like formatSle but tolerates `null`/`undefined` (renders an em dash). */
export function formatSleOrDash(minor: string | bigint | null | undefined): string {
  return minor === null || minor === undefined || minor === "" ? "—" : formatSle(minor);
}

export type ParseResult = { ok: true; minor: string } | { ok: false; error: string };

/**
 * What a user types (major units) → minor-unit string.
 * Accepts `1500`, `1500.5`, `1,500.50`, with an optional leading `SLE`.
 * Rejects zero, negatives, more than 2 decimals, bad thousands grouping and anything
 * the API would refuse (more than 18 digits of minor units).
 */
export function parseSleInput(input: string): ParseResult {
  const s = input.trim().replace(/^SLE\s*/i, "");
  if (s === "") return { ok: false, error: "Enter an amount" };
  if (s.startsWith("-")) return { ok: false, error: "Amount must be greater than zero" };
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) {
    if (/^[\d,]*\.\d{3,}$/.test(s)) return { ok: false, error: "At most 2 decimal places (cents)" };
    return { ok: false, error: "Enter an amount like 1500 or 1,500.50" };
  }
  const major = m[1].replace(/,/g, "");
  const cents = (m[2] ?? "").padEnd(2, "0");
  const minor = (major + cents).replace(/^0+(?=\d)/, "");
  if (/^0+$/.test(minor)) return { ok: false, error: "Amount must be greater than zero" };
  if (!API_MINOR_RE.test(minor)) return { ok: false, error: "Amount is too large" };
  return { ok: true, minor };
}

/** -1, 0 or 1. */
export function compareMinor(a: string | bigint, b: string | bigint): -1 | 0 | 1 {
  const x = toBigInt(a);
  const y = toBigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function sumMinor(...values: (string | bigint)[]): string {
  return values.reduce<bigint>((acc, v) => acc + toBigInt(v), 0n).toString();
}

export function subtractMinor(a: string | bigint, b: string | bigint): string {
  return (toBigInt(a) - toBigInt(b)).toString();
}

/**
 * For chart geometry only (bar heights, axis ticks): major units as a JS number.
 * Precision loss above 2^53 minor units is irrelevant for drawing; never display or add these.
 */
export function minorToChartNumber(minor: string): number {
  return Number(toBigInt(minor)) / 100;
}

/** Compact axis label: 1_500_000_00 → "1.5M". For charts only. */
export function formatSleCompact(major: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(major);
}

// ── amounts in words (payout confirmation) ────────────────────────────────────

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion", "quadrillion", "quintillion"];

function under1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
    if (n) parts.push("and");
  }
  if (n >= 20) parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}

function integerInWords(v: bigint): string {
  if (v === 0n) return "zero";
  const groups: number[] = [];
  while (v > 0n) {
    groups.push(Number(v % 1000n));
    v /= 1000n;
  }
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (!g) continue;
    // "one thousand and five" reads naturally in Sierra Leonean / British English
    if (i === 0 && groups.length > 1 && g < 100) words.push("and");
    words.push(under1000(g) + (SCALES[i] ? ` ${SCALES[i]}` : ""));
  }
  return words.join(" ");
}

/** `"150050"` → `"One thousand five hundred leones and fifty cents"`. */
export function sleInWords(minor: string | bigint): string {
  const v = toBigInt(minor);
  if (v < 0n) throw new Error("sleInWords expects a non-negative amount");
  const major = v / 100n;
  const cents = Number(v % 100n);
  let s = `${integerInWords(major)} ${major === 1n ? "leone" : "leones"}`;
  if (cents) s += ` and ${integerInWords(BigInt(cents))} ${cents === 1 ? "cent" : "cents"}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
