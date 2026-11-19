/**
 * Dates are shown in Africa/Freetown (UTC+0, no DST), ISO in tooltips.
 * Calendar days ("YYYY-MM-DD", e.g. report ranges, due dates) are handled as plain
 * strings so they never shift by a time zone.
 */

export const TIME_ZONE = "Africa/Freetown";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const ymdFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ISO date-time → "19 Nov 2026, 14:05" (Freetown). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTimeFmt.format(d);
}

/** "YYYY-MM-DD" (or an ISO date-time) → "19 Nov 2026". */
export function formatDay(day: string | null | undefined): string {
  if (!day) return "—";
  const d = DAY_RE.test(day) ? new Date(`${day}T00:00:00Z`) : new Date(day);
  return Number.isNaN(d.getTime()) ? day : dateFmt.format(d);
}

/** "2026-11-19" → "19 Nov" (chart axes). */
export function formatDayShort(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" }).format(d);
}

/** Today's calendar day in Freetown. */
export function todayDay(now: Date = new Date()): string {
  return ymdFmt.format(now);
}

export function isDay(s: string | null | undefined): s is string {
  if (!s || !DAY_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Inclusive day count: ("2026-11-01", "2026-11-01") → 1. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Calendar day → start of that day as ISO date-time (for list filters that take date-time). */
export function dayStartIso(day: string): string {
  return `${day}T00:00:00.000Z`;
}

/** Calendar day → last millisecond of that day (inclusive `to`). */
export function dayEndIso(day: string): string {
  return `${day}T23:59:59.999Z`;
}

/** Yesterday in UTC (the default reconciliation day). */
export function yesterdayUtc(now: Date = new Date()): string {
  return addDays(now.toISOString().slice(0, 10), -1);
}

/** "3 min ago" style, for "updated" hints. */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86_400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86_400), "day");
}
