/** When the portal last got an event applied: fresh, or stale after 24 hours (shown in amber). */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function syncHealth(lastAppliedAt: string | null, now: Date = new Date()): "fresh" | "stale" | "never" {
  if (!lastAppliedAt) return "never";
  return now.getTime() - new Date(lastAppliedAt).getTime() > STALE_AFTER_MS ? "stale" : "fresh";
}

/** "Last update from the portal: 5 min ago" (or "3 hours ago", "2 days ago", "never"). */
export function lastUpdateLabel(lastAppliedAt: string | null, now: Date = new Date()): string {
  if (!lastAppliedAt) return "Last update from the portal: never";
  const s = Math.max(0, Math.round((now.getTime() - new Date(lastAppliedAt).getTime()) / 1000));
  const ago = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  const when =
    s < 45 ? "just now" : s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86_400 ? ago(Math.round(s / 3600), "hour") : ago(Math.round(s / 86_400), "day");
  return `Last update from the portal: ${when}`;
}
