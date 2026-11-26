import { expect, test, type Page } from "@playwright/test";
import { PERSONA, signIn } from "./helpers";

const rows = (page: Page) => page.locator("main table").first().locator("tbody tr");

test.describe("payments no longer expire", () => {
  test("payments list: PROCESSING in the status filter, statuses in words", async ({ page }) => {
    await signIn(page, PERSONA.auditor, { next: "/payments" });
    await expect(rows(page).first()).toBeVisible();
    await page.getByRole("combobox", { name: "Status" }).click();
    await expect(page.getByRole("option")).toHaveText(["All", "Starting", "Awaiting payment", "Processing", "Paid", "Failed", "Expired (old)"]);
    await page.getByRole("option", { name: "Processing" }).click();
    await expect(page).toHaveURL(/status=PROCESSING/);
    await expect(rows(page).first()).toBeVisible();
    for (const r of await rows(page).all()) await expect(r.locator('[data-status="PROCESSING"]')).toHaveText("Processing");
  });

  test("a processing payment: created → processing in the timeline; Check with Monime only reports", async ({ page }) => {
    await signIn(page, PERSONA.super, { totp: true, next: "/payments?status=PROCESSING" });
    await rows(page).first().click();
    await expect(page).toHaveURL(/\/payments\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading").locator('[data-status="PROCESSING"]')).toHaveText("Processing");
    const timeline = page.getByRole("list").filter({ hasText: "Created" });
    await expect(timeline.locator("li > div.font-medium")).toHaveText(["Created", "Processing"]);
    await expect(page.getByText(/Expires|Hold expired/)).toHaveCount(0);
    // never deleted while Monime is collecting
    await expect(page.getByText("Deleted if unpaid on")).toHaveCount(0);

    await page.getByRole("button", { name: "Check with Monime" }).click();
    const check = page.getByTestId("monime-check");
    await expect(check).toContainText("Monime has no completion for this payment yet, so it stays processing.");
    await expect(check).not.toContainText(/closed|expired/i);
    await expect(page.getByRole("heading").locator('[data-status="PROCESSING"]')).toBeVisible();
  });

  test("an unpaid payment shows when it would be deleted, not an expiry", async ({ page }) => {
    await signIn(page, PERSONA.auditor, { next: "/payments?status=PENDING" });
    await rows(page).first().click();
    await expect(page.getByRole("heading").locator('[data-status="PENDING"]')).toHaveText("Awaiting payment");
    await expect(page.getByText("Deleted if unpaid on")).toBeVisible();
    await expect(page.getByText(/Expires|Hold expired/)).toHaveCount(0);
  });

  test("a removed unpaid payment: readable in the audit log, and its page says it was never paid", async ({ page }) => {
    await signIn(page, PERSONA.auditor, { next: "/audit?entity=Payment" });
    const removed = page.locator("tbody tr").filter({ hasText: "Unpaid payment removed" });
    await expect(removed).toHaveCount(2);
    await expect(removed.filter({ hasText: "15999001" })).toContainText("Payment 15999001, SLE 4,500.00 removed: nobody paid it within 7 days");
    await expect(removed.filter({ hasText: "15999002" })).toContainText("removed: another payment for this fee completed (30000123)");

    await removed.filter({ hasText: "15999001" }).getByRole("link").click();
    await expect(page).toHaveURL(/\/payments\/[0-9a-f-]{36}$/);
    await expect(page.getByText("This payment was removed because it was never paid")).toBeVisible();
    await expect(page.getByText("Payment not found")).toHaveCount(0);
  });

  test("collections funnel: awaiting payment → processing → completed; expired only for old payments", async ({ page }) => {
    await signIn(page, PERSONA.auditor);
    const funnel = page.getByTestId("payment-funnel");
    await expect(funnel).toBeVisible();
    const labels = await funnel.getByTestId("funnel-row").locator("div > span:first-child").allInnerTexts();
    expect(labels.slice(0, 4)).toEqual(["Awaiting payment", "Processing", "Completed", "Failed"]);
    // the mock's old expired payments fall in the default 30 days
    expect(labels.slice(4)).toEqual(["Expired (before 28 Nov)"]);
    await expect(funnel).not.toContainText("Pending");
  });

  test("reconciliation: processing for over an hour, oldest first; an UNMATCHED note in full", async ({ page }) => {
    await signIn(page, PERSONA.auditor, { next: "/reconciliation" });
    const section = page.locator("#staleOpenPayments");
    await expect(section).toContainText("Processing for over an hour");
    const stale = section.locator("tbody tr");
    await expect(stale.first()).toBeVisible();
    for (const r of await stale.all()) await expect(r.locator('[data-status="PROCESSING"]')).toBeVisible();
    const since = await section.locator("tbody tr td:nth-child(4) time").evaluateAll((ts) => ts.map((t) => t.getAttribute("datetime")!));
    expect(since.length).toBeGreaterThan(0);
    expect([...since].sort()).toEqual(since);

    await page.getByRole("tab", { name: "Webhook events" }).click();
    const note = page.getByText(/^UNIMAK payment 15999001 not found \(deleted while awaiting payment\?\); Monime spm-late000001 for obligation .+: apply or refund by hand$/);
    await expect(note).toBeVisible();
    // not cut off
    expect(await note.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  });
});
