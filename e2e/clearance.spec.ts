import { expect, test } from "@playwright/test";
import { PERSONA, signIn } from "./helpers";

const nav = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Main" });

test.describe("exam clearance rule", () => {
  test("placeholder banner; a rule that blocks nothing is refused inline; saving clears the placeholder and is audited", async ({ page }) => {
    await signIn(page, PERSONA.super, { totp: true });
    await nav(page).getByRole("link", { name: "Exam clearance" }).click();
    await expect(page.getByRole("heading", { name: "Exam clearance" })).toBeVisible();

    const banner = page.getByTestId("clearance-placeholder");
    await expect(banner).toContainText("This is a placeholder rule, not the university's.");
    await expect(banner).toContainText("Set the real rule before students use exam passes.");
    await expect(page.getByLabel("Exam", { exact: true })).toHaveValue("First semester exams");
    await expect(page.getByLabel("Period")).toHaveValue("2026/27");
    const tuition = page.getByRole("checkbox", { name: "TUITION · Tuition" });
    const overdue = page.getByRole("checkbox", { name: "Fees past their due date must also be paid" });
    await expect(tuition).toBeChecked();
    await expect(overdue).toBeChecked();
    await expect(page.getByTestId("clearance-updated")).toContainText("Last changed by the initial setup at");

    // nothing listed and overdue off: everyone would be cleared
    await tuition.click();
    await overdue.click();
    await page.getByRole("button", { name: "Save rule" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The rule must list fee types or count overdue fees; otherwise everyone is cleared" })).toBeVisible();
    await expect(banner).toBeVisible();

    await tuition.click();
    await page.getByRole("checkbox", { name: "DEPT · Department levy" }).click();
    await page.getByLabel("Exam", { exact: true }).fill("Second semester exams");
    await page.getByRole("button", { name: "Save rule" }).click();
    await expect(page.getByText("Saved. Passes already issued re-check against this rule.")).toBeVisible();
    await expect(banner).toHaveCount(0);
    await expect(page.getByTestId("clearance-updated")).toContainText("Last changed by you at");
    await expect(page.getByLabel("Exam", { exact: true })).toHaveValue("Second semester exams");
    await expect(page.getByRole("checkbox", { name: "DEPT · Department levy" })).toBeChecked();
    await expect(overdue).not.toBeChecked();

    await nav(page).getByRole("link", { name: "Audit log" }).click();
    await expect(page.getByTestId("audit-action").filter({ hasText: "Exam clearance rule changed" }).first()).toBeVisible();
  });

  test("without clearance.manage it is read-only, and the save button names the permission", async ({ page }) => {
    await signIn(page, PERSONA.auditor, { next: "/fees/clearance" });
    await expect(page.getByTestId("clearance-placeholder")).toBeVisible();
    await expect(page.getByLabel("Exam", { exact: true })).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: "Fees past their due date must also be paid" })).toBeDisabled();
    const save = page.getByRole("button", { name: "Save rule" });
    await expect(save).toBeDisabled();
    await save.locator("xpath=..").hover();
    await expect(page.getByRole("tooltip")).toContainText("Requires the clearance.manage permission");
  });

  test("needs fees.read: not in the finance officer's navigation, no access by URL", async ({ page }) => {
    await signIn(page, PERSONA.finance);
    await expect(nav(page).getByRole("link", { name: "Payments" })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Exam clearance" })).toHaveCount(0);
    await page.goto("/fees/clearance");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await expect(page.getByText("fees.read")).toBeVisible();
  });

  test("clearance.manage can be granted from the Users screen", async ({ page }) => {
    await signIn(page, PERSONA.super, { totp: true, next: "/users" });
    await page.getByRole("button", { name: "Invite admin" }).click();
    await expect(page.getByRole("dialog").getByText("clearance.manage", { exact: true })).toBeVisible();
  });
});
