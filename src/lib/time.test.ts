import { describe, expect, it } from "vitest";
import {
  addDays,
  dayEndIso,
  daysInclusive,
  formatDateTime,
  formatDay,
  isDay,
  todayDay,
  yesterdayUtc,
} from "./time";

describe("time", () => {
  it("formats date-times in Freetown (UTC)", () => {
    expect(formatDateTime("2026-11-19T14:05:09.000Z")).toBe("19 Nov 2026, 14:05");
    expect(formatDateTime(null)).toBe("—");
  });

  it("formats calendar days without shifting", () => {
    expect(formatDay("2026-01-01")).toBe("01 Jan 2026");
    expect(formatDay(null)).toBe("—");
  });

  it("does day math on strings", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysInclusive("2026-11-01", "2026-11-01")).toBe(1);
    expect(daysInclusive("2026-01-01", "2026-12-31")).toBe(365);
    expect(dayEndIso("2026-11-19")).toBe("2026-11-19T23:59:59.999Z");
  });

  it("knows today and yesterday", () => {
    const now = new Date("2026-11-19T00:30:00Z");
    expect(todayDay(now)).toBe("2026-11-19");
    expect(yesterdayUtc(now)).toBe("2026-11-18");
  });

  it("validates days", () => {
    expect(isDay("2026-11-19")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("19/11/2026")).toBe(false);
    expect(isDay(null)).toBe(false);
  });
});
