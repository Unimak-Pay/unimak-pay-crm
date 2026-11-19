import { expect, test, type Page } from "@playwright/test";
import { PERSONA, signIn } from "./helpers";

async function fillPayout(page: Page, amount: string, narration = "") {
  await page.getByLabel("Pay from").click();
  await page.getByRole("option", { name: /TUITION · unimak-fee-tuition/ }).click();
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel("Bank").click();
  await page.getByRole("option", { name: "Sierra Leone Commercial Bank" }).click();
  await page.getByLabel("Account number").fill("0012345678901");
  await page.getByLabel("Account name").fill("University of Makeni");
  if (narration) await page.getByLabel("Narration").fill(narration);
  await page.getByRole("button", { name: "Review payout" }).click();
}

test("payout: review restates the amount in words, needs a tick, then polls to COMPLETED", async ({ page }) => {
  await signIn(page, PERSONA.super, { totp: true });
  await page.goto("/treasury/payouts/new");

  await fillPayout(page, "999,999,999");
  await expect(page.getByText(/More than the available balance/)).toBeVisible();

  await page.getByLabel("Amount").fill("1,500.50");
  await page.getByRole("button", { name: "Review payout" }).click();
  await expect(page.getByText("SLE 1,500.50").first()).toBeVisible();
  await expect(page.getByText("One thousand five hundred leones and fifty cents")).toBeVisible();

  const send = page.getByRole("button", { name: "Send SLE 1,500.50" });
  await expect(send).toBeDisabled();
  await page.getByRole("checkbox").check();
  await send.click();

  await expect(page).toHaveURL(/\/treasury\/payouts\/[0-9a-f-]+\?submitted=1/);
  await expect(page.getByText("Submitted to Monime")).toBeVisible();
  await expect(page.getByText("Paid out")).toBeVisible({ timeout: 15_000 });
});

test("payout: an uncertain failure locks the form and the retry reuses the idempotency key", async ({ page }) => {
  await signIn(page, PERSONA.super, { totp: true });
  await page.goto("/treasury/payouts/new");
  await fillPayout(page, "100", "SIMULATE_503 test");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send SLE 100.00" }).click();

  await expect(page.getByText("Monime is unavailable, try again.")).toBeVisible();
  await expect(page.getByText("The last attempt may have reached Monime")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change details" })).toBeDisabled();

  await page.getByRole("button", { name: "Retry SLE 100.00 payout" }).click();
  await expect(page).toHaveURL(/\/treasury\/payouts\/[0-9a-f-]+/);

  const keys = await page.evaluate(() => (window as unknown as { __mockPayoutAttempts?: string[] }).__mockPayoutAttempts);
  // page navigated client-side, so the mock's memory survives
  expect(keys).toHaveLength(2);
  expect(keys![0]).toBe(keys![1]);
});

test("payments: search by Monime order number, open detail", async ({ page }) => {
  await signIn(page, PERSONA.finance);
  await page.goto("/payments?status=COMPLETED");
  const firstRef = (await page.locator("tbody tr").first().locator("td").nth(1).innerText()).trim();
  await page.getByLabel("Payment ref, order no. or spm- id").fill(firstRef);
  await page.getByLabel("Payment ref, order no. or spm- id").press("Enter");
  await expect(page).toHaveURL(new RegExp(`ref=${firstRef}`));
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.locator("tbody tr").first().click();
  await expect(page.getByRole("heading", { name: new RegExp(`Payment ${firstRef}`) })).toBeVisible();
  await expect(page.getByText("Net to fee account")).toBeVisible();
});

test("fees: an ambiguous rate rule is refused inline with the server's message", async ({ page }) => {
  await signIn(page, PERSONA.super, { totp: true });
  await page.goto("/fees?feeType=TUITION&status=ACTIVE");
  await page.getByText("Tuition 2026/27").click();
  await page.getByRole("button", { name: "Add rate rule" }).click();
  await page.getByLabel("Department").fill("COMPUTING");
  await page.getByLabel("Amount").fill("4,000");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText("This rule would make some payers' price ambiguous")).toBeVisible();
  await expect(page.getByText(/Add a rule for department=COMPUTING, residency=INTERNATIONAL first/)).toBeVisible();
});

test("transfers: retrying a FAILED transfer asks for confirmation naming the amount", async ({ page }) => {
  await signIn(page, PERSONA.super, { totp: true });
  await page.goto("/treasury/transfers?status=FAILED");
  await page.locator("tbody tr").first().getByRole("link", { name: "Open" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/treasury\/transfers\/[0-9a-f-]+$/);
  await page.getByRole("button", { name: "Retry" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Retry this commission transfer?");
  await dialog.getByRole("button", { name: /^Transfer SLE/ }).click();
  await expect(page.getByText(/Transfer retried \(attempt 2\)/)).toBeVisible();
});
