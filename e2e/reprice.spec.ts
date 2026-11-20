import { expect, type Page, test } from "@playwright/test";
import { PERSONA, signIn } from "./helpers";

async function openFee(page: Page, feeType: string, name: string) {
  await page.goto(`/fees?feeType=${feeType}&status=ACTIVE`);
  await page.getByText(name).click();
  await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
}

test("re-pricing: suggested after a rate rule changes; preview, confirm, apply, then nothing left", async ({ page }) => {
  test.slow();
  await signIn(page, PERSONA.super, { totp: true });
  await openFee(page, "TUITION", "Tuition 2026/27");

  // the catch-all rule is the least specific, so it's the last row: 4,500 → 4,750
  await page.locator("tbody tr").last().getByRole("button", { name: "Edit rule" }).click();
  await page.getByLabel("Amount").fill("4,750");
  await page.getByRole("button", { name: "Save rule" }).click();

  const suggestion = page.getByTestId("reprice-suggestion");
  await expect(suggestion).toContainText("Rate rules changed");
  await suggestion.getByRole("button", { name: "Re-price existing obligations" }).click();

  const dialog = page.getByRole("dialog", { name: "Re-price existing obligations" });
  const summary = dialog.getByTestId("reprice-summary");
  await expect(summary).toContainText("Would change4");
  await expect(summary).toContainText("Total difference+SLE 1,000.00");
  await expect(summary).toContainText("Already at the current price3");
  await expect(summary).toContainText("Skipped3");

  const changes = dialog.getByRole("region", { name: "Changes" });
  await expect(changes.locator("tbody tr")).toHaveCount(4);
  const first = changes.locator("tbody tr").first();
  await expect(first).toContainText(/UNI-2025-\d{4} · student/);
  await expect(first).toContainText("SLE 4,500.00");
  await expect(first).toContainText("SLE 4,750.00");
  await expect(first).toContainText("+SLE 250.00");

  const skipped = dialog.getByRole("region", { name: "Skipped" });
  await expect(skipped).toContainText("Paid in full");
  await expect(skipped).toContainText("Part paid: decide manually");
  await expect(skipped).toContainText("Payment in progress: try again in 15 minutes");

  await dialog.getByRole("button", { name: "Apply" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("This adds ledger adjustments for 4 payers, total +SLE 1,000.00.");
  await confirm.getByRole("button", { name: "Apply re-pricing" }).click();

  const done = page.getByRole("dialog", { name: "Re-priced Tuition 2026/27" });
  await expect(done).toContainText("Ledger adjustments were added for 4 payers");
  await expect(done.getByTestId("reprice-summary")).toContainText("Changed4");
  await expect(done.getByRole("button", { name: "Apply" })).toHaveCount(0);
  await done.getByRole("button", { name: "Close" }).first().click();

  // applied: the suggestion goes away, and running it again finds nothing to change
  await expect(suggestion).toHaveCount(0);
  await page.getByRole("button", { name: "Re-price existing obligations" }).click();
  const again = page.getByRole("dialog", { name: "Re-price existing obligations" });
  await expect(again).toContainText("Everyone is already at the current price");
  await expect(again.getByTestId("reprice-summary")).toContainText("Already at the current price7");
  await expect(again.getByRole("button", { name: "Apply" })).toHaveCount(0);
});

test("re-pricing: a price cut shows a negative difference", async ({ page }) => {
  await signIn(page, PERSONA.super, { totp: true });
  await openFee(page, "TUITION", "Tuition 2026/27");
  // the INTERNATIONAL-only rule (SLE 9,000) is the second row: cut it to 8,500
  const row = page.locator("tbody tr").filter({ hasText: "SLE 9,000.00" });
  await row.getByRole("button", { name: "Edit rule" }).click();
  await page.getByLabel("Amount").fill("8,500");
  await page.getByRole("button", { name: "Save rule" }).click();
  await page.getByTestId("reprice-suggestion").getByRole("button", { name: "Re-price existing obligations" }).click();
  const dialog = page.getByRole("dialog", { name: "Re-price existing obligations" });
  await expect(dialog.getByTestId("reprice-summary")).toContainText("Total difference-SLE 500.00");
  await expect(dialog.getByRole("region", { name: "Changes" }).locator("tbody tr")).toHaveCount(1);
  await expect(dialog.getByRole("region", { name: "Changes" })).toContainText("-SLE 500.00");
});

test("re-pricing: no changes hides Apply and lists who was skipped", async ({ page }) => {
  await signIn(page, PERSONA.super, { totp: true });
  await openFee(page, "DEPT", "Department levy 2026/27");
  await page.getByRole("button", { name: "Re-price existing obligations" }).click();
  const dialog = page.getByRole("dialog", { name: "Re-price existing obligations" });
  await expect(dialog).toContainText("Everyone is already at the current price");
  await expect(dialog.getByRole("button", { name: "Apply" })).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "Changes" })).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "Skipped" })).toContainText("No longer eligible");
});

test("re-pricing needs fees.manage", async ({ page }) => {
  await signIn(page, PERSONA.hod);
  await openFee(page, "TUITION", "Tuition 2026/27");
  const btn = page.getByRole("button", { name: "Re-price existing obligations" });
  await expect(btn).toBeDisabled();
  await btn.locator("..").hover();
  await expect(page.getByRole("tooltip")).toContainText("Requires the fees.manage permission");
});
