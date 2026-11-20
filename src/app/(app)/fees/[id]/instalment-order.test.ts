import { describe, expect, it } from "vitest";
import type { components } from "@/api/schema.gen";
import { groupInstalmentRules, levelLabel } from "./instalment-order";

type Rule = components["schemas"]["InstalmentRule"];
const rule = (department: string, level: number | null): Rule => ({
  id: `${department}-${level}`, feeId: "f", department, level, minInstalment: "100000", updatedBy: "u", updatedAt: "2026-11-19T12:00:00Z",
});
const names: Record<string, string> = { NURSING: "Nursing", COMPUTING: "Computer Science", LAW: "Law" };

describe("groupInstalmentRules", () => {
  it("groups by department name, all levels first, then levels ascending", () => {
    const out = groupInstalmentRules(
      [rule("NURSING", 4), rule("LAW", 2), rule("NURSING", null), rule("COMPUTING", 10), rule("NURSING", 2), rule("COMPUTING", 3)],
      (c) => names[c] ?? c,
    );
    expect(out.map((g) => [g.department, g.rules.map((r) => r.level)])).toEqual([
      ["COMPUTING", [3, 10]],
      ["LAW", [2]],
      ["NURSING", [null, 2, 4]],
    ]);
  });
});

describe("levelLabel", () => {
  it("names null as all levels", () => {
    expect(levelLabel(null)).toBe("All levels");
    expect(levelLabel(3)).toBe("Level 3");
  });
});
