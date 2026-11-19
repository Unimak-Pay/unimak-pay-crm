import { expect, test } from "@playwright/test";
import { PERSONA, signIn } from "./helpers";

test("finance officer: read-only navigation, money actions not offered", async ({ page }) => {
  await signIn(page, PERSONA.finance);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Payments" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Payouts" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Fees", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Audit log" })).toHaveCount(0);

  await nav.getByRole("link", { name: "Payouts" }).click();
  await expect(page.getByRole("link", { name: "New payout" })).toHaveCount(0);

  // a page outside the role shows a no-access state, not an error
  await page.goto("/users");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
  await expect(page.getByText("users.manage")).toBeVisible();
});

test("auditor sees the payments export disabled with the missing permission", async ({ page }) => {
  await signIn(page, PERSONA.auditor);
  await page.goto("/payments");
  const exportBtn = page.getByRole("button", { name: "Export CSV" });
  await expect(exportBtn).toBeDisabled();
  await exportBtn.locator("..").hover();
  await expect(page.getByRole("tooltip")).toContainText("Requires the payments.export permission");
});

test("head of department: departments in the header, only their payments", async ({ page }) => {
  await signIn(page, PERSONA.hod);
  await expect(page.getByTitle("You see payments for these departments only")).toContainText("COMPUTING");
  await page.goto("/payments");
  await expect(page.getByText("Only COMPUTING.")).toBeVisible();
  const programs = page.locator("tbody tr td:nth-child(3) div div:last-child");
  await expect(programs.first()).toBeVisible();
  for (const text of await programs.allTextContents()) expect(text).toMatch(/BSC-(CS|IT)/);
});
