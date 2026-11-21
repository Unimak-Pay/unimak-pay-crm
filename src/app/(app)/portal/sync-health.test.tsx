import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SyncBadge } from "./events/events";
import { lastUpdateLabel, syncHealth } from "./sync-health";

const now = new Date("2026-11-21T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("syncHealth", () => {
  it("is fresh up to 24 hours, stale after, never without an applied event", () => {
    expect(syncHealth(ago(5 * MIN), now)).toBe("fresh");
    expect(syncHealth(ago(24 * HOUR), now)).toBe("fresh");
    expect(syncHealth(ago(24 * HOUR + MIN), now)).toBe("stale");
    expect(syncHealth(null, now)).toBe("never");
  });
});

describe("lastUpdateLabel", () => {
  it.each([
    [10_000, "just now"],
    [5 * MIN, "5 min ago"],
    [1 * MIN, "1 min ago"],
    [3 * HOUR, "3 hours ago"],
    [1 * HOUR, "1 hour ago"],
    [50 * HOUR, "2 days ago"],
  ])("%d ms → %s", (ms, when) => expect(lastUpdateLabel(ago(ms), now)).toBe(`Last update from the portal: ${when}`));
  it("says never without one", () => expect(lastUpdateLabel(null, now)).toBe("Last update from the portal: never"));
});

describe("SyncBadge", () => {
  it("is amber after 24 hours", () => {
    render(<SyncBadge lastAppliedAt={ago(30 * HOUR)} now={now} />);
    const b = screen.getByTestId("portal-sync");
    expect(b).toHaveTextContent("Last update from the portal: 1 day ago");
    expect(b).toHaveAttribute("data-health", "stale");
    expect(b.className).toMatch(/amber/);
  });
  it("is green while fresh", () => {
    render(<SyncBadge lastAppliedAt={ago(5 * MIN)} now={now} />);
    const b = screen.getByTestId("portal-sync");
    expect(b).toHaveTextContent("Last update from the portal: 5 min ago");
    expect(b.className).not.toMatch(/amber/);
  });
});
