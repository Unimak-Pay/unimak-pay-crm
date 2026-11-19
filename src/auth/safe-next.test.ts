import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it.each([
    [null, "/"],
    ["/payments?status=FAILED", "/payments?status=FAILED"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["https://evil.example", "/"],
    ["/sign-in", "/"],
    ["/no-access", "/"],
    ["/auth/accept-invite?token_hash=x", "/"],
  ])("%s → %s", (input, out) => expect(safeNext(input)).toBe(out));
});
