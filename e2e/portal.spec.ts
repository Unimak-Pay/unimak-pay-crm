import { expect, test } from "@playwright/test";
import { PERSONA, signIn } from "./helpers";

const nav = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Main" });

test.describe("needs review", () => {
  test("students no longer active who still owe; a row expands to its obligations; filters", async ({ page }) => {
    await signIn(page, PERSONA.super, { totp: true });
    await nav(page).getByRole("link", { name: "Needs review" }).click();
    await expect(page.getByRole("heading", { name: "Needs review" })).toBeVisible();
    const rows = page.getByTestId("needs-review-row");
    await expect(rows).toHaveCount(8);

    // name, ref, department, level, status, since, total balance
    const second = rows.nth(1);
    await expect(second).toContainText("UNI-2024-0701");
    await expect(second).toContainText("Computer Science");
    await expect(second.locator("td").nth(4)).toHaveText("4");
    await expect(second).toContainText("GRADUATED");
    await expect(second.locator("td").last()).toHaveText("SLE 800.00");

    const toggle = second.getByRole("button", { name: /obligations$/ });
    await expect(toggle).toHaveAccessibleName(/^Show .*'s obligations$/);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveAccessibleName(/^Hide /);
    const detail = page.locator(`[id="${await toggle.getAttribute("aria-controls")}"]`);
    await expect(detail.locator("tbody tr")).toHaveCount(2);
    await expect(detail.locator("tbody tr").nth(0)).toContainText(/Tuition 2025\/26.*2025\/26.*SLE 4,500\.00.*SLE 500\.00/);
    await expect(detail.locator("tbody tr").nth(1)).toContainText(/Department levy 2026\/27.*SLE 300\.00.*SLE 300\.00/);

    await page.getByRole("combobox", { name: "Status" }).click();
    await page.getByRole("option", { name: "GRADUATED" }).click();
    await expect(page).toHaveURL(/status=GRADUATED/);
    await expect(rows).toHaveCount(2);

    await page.getByRole("combobox", { name: "Department" }).click();
    await page.getByRole("option", { name: "Nursing" }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Nursing");
  });

  test("a head of department sees only their department", async ({ page }) => {
    await signIn(page, PERSONA.hod);
    await page.goto("/portal/needs-review");
    const rows = page.getByTestId("needs-review-row");
    await expect(rows).toHaveCount(3);
    for (const t of await rows.locator("td:nth-child(4)").allTextContents()) expect(t).toBe("Computer Science");
    await page.getByRole("combobox", { name: "Department" }).click();
    await expect(page.getByRole("option")).toHaveText(["All departments", "Computer Science"]);
    // no portal.read: the events screen isn't offered
    await expect(nav(page).getByRole("link", { name: "Portal events" })).toHaveCount(0);
  });
});

test.describe("portal events", () => {
  test("newest first with paging, the sync badge, REJECTED errors, filters", async ({ page }) => {
    await signIn(page, PERSONA.auditor); // every *.read, portal.read included
    await nav(page).getByRole("link", { name: "Portal events" }).click();
    const badge = page.getByTestId("portal-sync");
    await expect(badge).toHaveText("Last update from the portal: 5 min ago");
    await expect(badge).toHaveAttribute("data-health", "fresh");

    const rows = page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Result" }) }).locator("tbody tr");
    await expect(rows).toHaveCount(50);
    await expect(rows.first()).toContainText("student.upserted");
    await expect(rows.first()).toContainText("UNI-2025-0100");
    await expect(rows.first()).toContainText("APPLIED");
    await page.getByRole("button", { name: "Load more" }).click();
    await expect(rows).toHaveCount(70);
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);

    await page.getByRole("combobox", { name: "Result" }).click();
    await page.getByRole("option", { name: "REJECTED" }).click();
    await expect(rows).toHaveCount(6);
    await expect(rows.first()).toContainText("REJECTED");
    await expect(rows.first()).toContainText("phone must match");
    await expect(rows.nth(1)).toContainText("department must be a known department code");
    // the badge is about the last APPLIED event, whatever the filter
    await expect(badge).toHaveText("Last update from the portal: 5 min ago");

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/result=/);
    await expect(page.getByRole("combobox", { name: "Result" })).toHaveText("All");
    await page.getByLabel("Ref (student id or application ref)").fill("UNI-2025-0100");
    await page.getByLabel("Ref (student id or application ref)").press("Enter");
    await expect(rows).toHaveCount(2);
    for (const t of await rows.locator("td:nth-child(3)").allTextContents()) expect(t).toBe("UNI-2025-0100");
  });

  test("portal.read is offered in the users screen's permission list", async ({ page }) => {
    await signIn(page, PERSONA.super, { totp: true });
    await page.goto("/users");
    await page.getByRole("button", { name: "Invite admin" }).click();
    await expect(page.getByRole("dialog").getByText("portal.read", { exact: true })).toBeVisible();
  });

  test("without portal.read the page says which permission is missing", async ({ page }) => {
    await signIn(page, PERSONA.finance);
    await expect(nav(page).getByRole("link", { name: "Portal events" })).toHaveCount(0);
    await expect(nav(page).getByRole("link", { name: "Needs review" })).toBeVisible();
    await page.goto("/portal/events");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await expect(page.getByText("portal.read")).toBeVisible();
  });
});
