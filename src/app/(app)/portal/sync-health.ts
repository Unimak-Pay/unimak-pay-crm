/** When the portal last got an event applied: fresh, or stale after 24 hours (shown in amber). */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function syncHealth(lastAppliedAt: string | null, now: Date = new Date()): "fresh" | "stale" | "never" {
  if (!lastAppliedAt) return "never";
  return now.getTime() - new Date(lastAppliedAt).getTime() > STALE_AFTER_MS ? "stale" : "fresh";
}

/** "5 min ago", "3 hours ago", "2 days ago", "just now"; null when never. */
export function portalAgo(lastAppliedAt: string | null, now: Date = new Date()): string | null {
  if (!lastAppliedAt) return null;
  const s = Math.max(0, Math.round((now.getTime() - new Date(lastAppliedAt).getTime()) / 1000));
  const ago = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  return s < 45 ? "just now" : s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86_400 ? ago(Math.round(s / 3600), "hour") : ago(Math.round(s / 86_400), "day");
}

/** "Last update from the portal: 5 min ago" (or "3 hours ago", "2 days ago", "never"). */
export function lastUpdateLabel(lastAppliedAt: string | null, now: Date = new Date()): string {
  return `Last update from the portal: ${portalAgo(lastAppliedAt, now) ?? "never"}`;
}

/** For data pages (the outstanding report): "Data from the portal, updated 5 min ago". */
export function dataFreshnessLabel(lastAppliedAt: string | null, now: Date = new Date()): string {
  const ago = portalAgo(lastAppliedAt, now);
  return ago ? `Data from the portal, updated ${ago}` : "No data from the portal yet";
}
