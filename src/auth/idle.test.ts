import { describe, expect, it } from "vitest";
import { IDLE_LIMIT_MS, isIdle } from "./idle";

describe("isIdle", () => {
  it("is idle at exactly 30 minutes", () => {
    expect(isIdle(0, IDLE_LIMIT_MS)).toBe(true);
    expect(isIdle(0, IDLE_LIMIT_MS - 1)).toBe(false);
  });
});
