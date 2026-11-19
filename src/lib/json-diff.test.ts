import { describe, expect, it } from "vitest";
import { jsonDiff } from "./json-diff";

describe("jsonDiff", () => {
  it("reports changed, added and removed fields by path", () => {
    expect(
      jsonDiff({ status: "DRAFT", allowInstalments: false, meta: { a: 1, gone: true } }, { status: "ACTIVE", allowInstalments: false, meta: { a: 2 }, dueDate: "2027-01-31" }),
    ).toEqual([
      { path: "dueDate", kind: "added", after: "2027-01-31" },
      { path: "meta.a", kind: "changed", before: 1, after: 2 },
      { path: "meta.gone", kind: "removed", before: true },
      { path: "status", kind: "changed", before: "DRAFT", after: "ACTIVE" },
    ]);
  });

  it("treats a created entity as all-added and a deleted one as all-removed", () => {
    expect(jsonDiff(null, { amount: "100" })).toEqual([{ path: "amount", kind: "added", after: "100" }]);
    expect(jsonDiff({ amount: "100" }, null)).toEqual([{ path: "amount", kind: "removed", before: "100" }]);
  });

  it("compares arrays as a whole and ignores unchanged fields", () => {
    expect(jsonDiff({ d: ["A"], x: 1 }, { d: ["A", "B"], x: 1 })).toEqual([{ path: "d", kind: "changed", before: ["A"], after: ["A", "B"] }]);
    expect(jsonDiff({ x: 1 }, { x: 1 })).toEqual([]);
  });
});
