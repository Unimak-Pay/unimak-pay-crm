import { expect, it } from "vitest";
import { withRunningBalance } from "./ledger";

it("orders entries oldest first and carries the balance after each, in exact minor units", () => {
  const rows = withRunningBalance([
    { id: "p", amount: "-150000", createdAt: "2026-10-02T00:00:00Z" },
    { id: "c", amount: "9007199254740993", createdAt: "2026-10-01T00:00:00Z" },
    { id: "r", amount: "50000", createdAt: "2026-10-03T00:00:00Z" },
  ]);
  expect(rows.map((r) => [r.id, r.balanceAfter])).toEqual([
    ["c", "9007199254740993"],
    ["p", "9007199254590993"],
    ["r", "9007199254640993"],
  ]);
});
