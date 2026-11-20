import { expect, type Page, test } from "@playwright/test";
import { PERSONA, signIn } from "./helpers";

async function openInstalments(page: Page) {
  await signIn(page, PERSONA.super, { totp: true });
  await page.goto("/fees?feeType=TUITION&status=ACTIVE");
  await page.getByText("Tuition 2026/27").click();
  await page.getByRole("tab", { name: /Instalments/ }).click();
}

/** [department, level, minimum] per row, in display order. */
async function rows(page: Page) {
  const out: string[][] = [];
  for (const row of await page.getByTestId("instalment-rule").all()) {
    const cells = row.locator("td");
    out.push([(await cells.nth(0).textContent())!.trim(), (await cells.nth(1).textContent())!.trim(), (await cells.nth(2).textContent())!.trim()]);
  }
  return out;
}

test("minimum instalments per level: set a level rule, listed after the all-levels rule in level order", async ({ page }) => {
  await openInstalments(page);
  await expect(page.getByText("A level rule wins over the all-levels rule. Applicants only get the all-levels rule.")).toBeVisible();
  await expect.poll(() => rows(page)).toEqual([
    ["Nursing", "All levels", "SLE 1,500.00"],
    ["Nursing", "Level 4", "SLE 1,200.00"],
  ]);

  await page.getByRole("combobox", { name: "Department" }).click();
  await page.getByRole("option", { name: "Nursing" }).click();
  await page.getByRole("combobox", { name: "Level" }).click();
  await page.getByRole("option", { name: "Level 2", exact: true }).click();
  await page.getByLabel("Minimum instalment").fill("1,000");
  await page.getByRole("button", { name: "Set minimum" }).click();

  await expect.poll(() => rows(page)).toEqual([
    ["Nursing", "All levels", "SLE 1,500.00"],
    ["Nursing", "Level 2", "SLE 1,000.00"],
    ["Nursing", "Level 4", "SLE 1,200.00"],
  ]);
  // the form resets to all levels
  await expect(page.getByRole("combobox", { name: "Level" })).toHaveText("All levels");

  // editing a level rule keeps its level: same row updated, no new rule
  await page.getByRole("button", { name: "Change Nursing, level 2" }).click();
  await expect(page.getByRole("combobox", { name: "Level" })).toHaveText("Level 2");
  await page.getByLabel("Minimum instalment").fill("1,100");
  await page.getByRole("button", { name: "Set minimum" }).click();
  await expect.poll(() => rows(page)).toEqual([
    ["Nursing", "All levels", "SLE 1,500.00"],
    ["Nursing", "Level 2", "SLE 1,100.00"],
    ["Nursing", "Level 4", "SLE 1,200.00"],
  ]);
});

test("minimum instalments per level: deleting a level rule leaves the all-levels rule", async ({ page }) => {
  await openInstalments(page);
  await page.getByRole("button", { name: "Remove Nursing, level 4" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Remove the Nursing level 4 minimum?");
  await expect(dialog).toContainText("Nursing level 4 students will use the all-levels minimum (SLE 1,500.00) instead of SLE 1,200.00.");
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect.poll(() => rows(page)).toEqual([["Nursing", "All levels", "SLE 1,500.00"]]);
});
