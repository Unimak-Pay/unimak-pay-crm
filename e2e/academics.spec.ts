import { expect, test, type Page } from "@playwright/test";
import { PERSONA, signIn } from "./helpers";

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const facultyCard = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test.describe("faculties & departments", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, PERSONA.super, { totp: true });
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  });

  test("needs-review badge, set up a department the portal sent, badge clears", async ({ page }) => {
    const link = nav(page).getByRole("link", { name: /Faculties & departments/ });
    await expect(link.getByLabel("1 department need review")).toHaveText("1");
    await link.click();

    const review = page.getByRole("region", { name: /Needs review/ });
    await expect(review.getByRole("cell", { name: "MASS-COMM" })).toBeVisible();
    await review.getByRole("button", { name: "Set up" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Code")).toBeDisabled();
    await expect(dialog.getByLabel("Code")).toHaveValue("MASS-COMM");
    await dialog.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(dialog.locator("p.text-destructive", { hasText: "Choose a faculty" })).toBeVisible();
    await dialog.getByLabel("Name").fill("Mass Communication");
    await dialog.getByRole("combobox", { name: "Faculty" }).click();
    await page.getByRole("option", { name: "Faculty of Social Sciences" }).click();
    await dialog.getByRole("button", { name: "Mark reviewed" }).click();

    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Mass Communication is set up" })).toBeVisible();
    await expect(review).toHaveCount(0);
    await expect(link.getByLabel(/need review/)).toHaveCount(0);
    await expect(facultyCard(page, "Faculty of Social Sciences").getByRole("cell", { name: "Mass Communication", exact: true })).toBeVisible();
  });

  test("inactive faculties and departments are greyed out", async ({ page }) => {
    await page.goto("/academics");
    await expect(facultyCard(page, "Faculty of Agriculture")).toHaveAttribute("data-inactive", "true");
    await expect(facultyCard(page, "Faculty of Agriculture")).toHaveClass(/opacity-60/);
    const maths = facultyCard(page, "Faculty of Science & Technology").locator("tr", { hasText: "Mathematics" });
    await expect(maths).toHaveAttribute("data-inactive", "true");
    await expect(maths.getByText("Inactive")).toBeVisible();
    await expect(maths.getByRole("button", { name: "Reactivate Mathematics" })).toBeVisible();
  });

  test("codes can't be edited after creation; the form says to match the portal", async ({ page }) => {
    await page.goto("/academics");
    await page.getByRole("button", { name: "Add department" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Must match the portal's code exactly")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Edit Computer Science" }).click();
    await expect(page.getByRole("dialog").getByLabel("Code")).toBeDisabled();
  });

  test("409s are shown as the server words them", async ({ page }) => {
    await page.goto("/academics");
    await page.getByRole("button", { name: "Deactivate Computer Science" }).click();
    let dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Deactivate" }).click();
    await expect(dialog.getByText(/Department COMPUTING is still used by heads of department: hod@unimak.test; 1 eligibility rule\(s\)/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Deactivate Faculty of Science & Technology" }).click();
    dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Deactivate" }).click();
    await expect(dialog.getByText("Faculty FAC-SCI-TECH still has active departments: COMPUTING, INFO-TECH")).toBeVisible();
  });

  test("add a faculty, then a department in it; it's offered in the rule forms", async ({ page }) => {
    await page.goto("/academics");
    await page.getByRole("button", { name: "Add faculty" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Code").fill("FAC-EDU");
    await dialog.getByLabel("Name").fill("Faculty of Education");
    await dialog.getByRole("button", { name: "Add faculty" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Add a department to Faculty of Education" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Code").fill("EDU-PRIMARY");
    await dialog.getByLabel("Name").fill("Primary Education");
    await dialog.getByRole("button", { name: "Add department" }).click();
    await expect(dialog).toBeHidden();
    await expect(facultyCard(page, "Faculty of Education").getByRole("cell", { name: "Primary Education", exact: true })).toBeVisible();

    // a duplicate code is a 409, shown as it comes
    await page.getByRole("button", { name: "Add faculty" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Code").fill("FAC-EDU");
    await dialog.getByLabel("Name").fill("Again");
    await dialog.getByRole("button", { name: "Add faculty" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Faculty FAC-EDU already exists");
  });

  test("minimum instalments are per department, picked from the list", async ({ page }) => {
    await page.goto("/fees?feeType=TUITION&status=ACTIVE");
    await page.getByText("Tuition 2026/27").click();
    await page.getByRole("tab", { name: /Instalments/ }).click();
    await expect(page.getByRole("row", { name: /Nursing/ }).filter({ hasText: "SLE 1,500.00" })).toBeVisible();
    await page.getByRole("combobox", { name: "Department" }).click();
    await page.getByRole("option", { name: "Economics" }).click();
    await page.getByLabel("Minimum instalment").fill("1,200");
    await page.getByRole("button", { name: "Set minimum" }).click();
    await expect(page.getByRole("row", { name: /Economics/ })).toContainText("SLE 1,200.00");
  });
});

test.describe("dean", () => {
  test("sees their faculty's departments by name, and only those payments", async ({ page }) => {
    await signIn(page, PERSONA.dean);
    await expect(page.getByTestId("scope")).toHaveText("Faculty of Science & Technology · Computer Science, Information Technology, Mathematics");
    await expect(nav(page).getByRole("link", { name: "Commission transfers" })).toHaveCount(0);

    await page.goto("/payments");
    await expect(page.locator("tbody tr").first()).toBeVisible();
    const depts = page.locator("tbody tr td:nth-child(3) div div:nth-child(3)");
    for (const t of await depts.allTextContents()) expect(["Computer Science", "Information Technology"]).toContain(t);

    // filters are limited to their scope
    await page.getByRole("combobox", { name: "Faculty" }).click();
    await expect(page.getByRole("option")).toHaveText(["All faculties", "Faculty of Science & Technology"]);
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: "Department" }).click();
    await expect(page.getByRole("option")).toHaveText(["All departments", "Computer Science", "Information Technology"]);
    await page.getByRole("option", { name: "Information Technology" }).click();
    await expect(page).toHaveURL(/department=INFO-TECH/);
    await expect(page.locator("tbody tr").first()).toBeVisible();
    for (const t of await depts.allTextContents()) expect(t).toBe("Information Technology");
  });

  test("users: a dean takes faculties, a head of department takes departments", async ({ page }) => {
    await signIn(page, PERSONA.super, { totp: true });
    await page.goto("/users");
    await page.getByRole("button", { name: "Invite admin" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email").fill("newdean@unimak.test");
    await dialog.getByLabel("Role").click();
    await page.getByRole("option", { name: "DEAN" }).click();
    await dialog.getByRole("button", { name: "Send invite" }).click();
    await expect(dialog.getByText("A dean needs at least one faculty")).toBeVisible();
    const faculties = dialog.getByRole("group", { name: "Faculties" });
    await expect(faculties.getByLabel("Faculty of Agriculture")).toHaveCount(0); // inactive
    await faculties.getByLabel("Faculty of Law").check();
    await dialog.getByRole("button", { name: "Send invite" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("tbody tr").filter({ hasText: "newdean@unimak.test" })).toContainText("Faculty of Law");

    await page.getByRole("button", { name: "Invite admin" }).click();
    await dialog.getByLabel("Email").fill("newhod@unimak.test");
    await dialog.getByLabel("Role").click();
    await page.getByRole("option", { name: "HEAD OF DEPARTMENT" }).click();
    const departments = dialog.getByRole("group", { name: "Departments" });
    await expect(departments.getByText("Faculty of Nursing & Allied Health Sciences")).toBeVisible();
    await expect(departments.getByLabel("Mathematics")).toHaveCount(0);
    await departments.getByLabel("Nursing").check();
    await departments.getByLabel("Law").check();
    await dialog.getByRole("button", { name: "Send invite" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("tbody tr").filter({ hasText: "newhod@unimak.test" })).toContainText("Nursing, Law");
  });
});

test.describe("commission transfers are super-admin only", () => {
  test("without transfers.read the screen, the payment's transfer, the reconciliation sections and the report card are gone", async ({ page }) => {
    test.slow(); // five pages, each compiled on first visit by next dev
    await signIn(page, PERSONA.finance);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Commission transfers" })).toHaveCount(0);
    await expect(page.getByText("Failed commission transfers")).toHaveCount(0);
    await expect(page.getByText("Stuck transfers (> 1 h)")).toHaveCount(0);
    await expect(page.getByText("Stuck payouts (> 1 h)")).toBeVisible();
    await expect(page.getByText("By faculty")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Commission transfers" })).toHaveCount(0);
    await expect(page.getByText("Payouts", { exact: true }).last()).toBeVisible();

    await page.goto("/reconciliation");
    await expect(page.getByText("Stuck payouts (in flight over an hour)")).toBeVisible();
    await expect(page.getByText("Failed commission transfers")).toHaveCount(0);
    await expect(page.getByText("Stuck transfers (pending over an hour)")).toHaveCount(0);

    await page.goto("/payments?status=COMPLETED");
    await page.locator("tbody tr").first().click();
    await expect(page.getByText("Net to fee account")).toBeVisible();
    await expect(page.getByText("Commission transfer", { exact: true })).toHaveCount(0);
    await expect(page.getByText("No commission transfer yet.")).toHaveCount(0);

    await page.goto("/treasury/transfers");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  });

  test("a super admin still sees them all", async ({ page }) => {
    await signIn(page, PERSONA.super, { totp: true });
    await expect(nav(page).getByRole("link", { name: "Commission transfers" })).toBeVisible();
    await expect(page.getByText("Failed commission transfers")).toBeVisible();
    await page.goto("/reconciliation");
    await expect(page.getByText("Failed commission transfers")).toBeVisible();
    await page.goto("/payments?status=COMPLETED");
    await page.locator("tbody tr").first().click();
    await expect(page.getByText("Commission transfer", { exact: true })).toBeVisible();
  });
});

test("reports: by faculty and department; clicking a faculty sets the filter", async ({ page }) => {
  await signIn(page, PERSONA.super, { totp: true });
  const byFaculty = page.locator("[data-slot=card]").filter({ hasText: "By faculty" });
  await expect(byFaculty.getByText("No faculty yet")).toBeVisible();
  await expect(byFaculty.getByRole("button", { name: "No faculty yet" })).toHaveCount(0);
  await byFaculty.getByRole("button", { name: "Faculty of Nursing & Allied Health Sciences" }).click();
  await expect(page).toHaveURL(/faculty=FAC-NURSING-AHS/);
  await expect(page.getByRole("combobox", { name: "Faculty" })).toHaveText("Faculty of Nursing & Allied Health Sciences");
  const byDept = page.locator("[data-slot=card]").filter({ hasText: "By department" });
  await expect(byDept.locator("li")).toHaveCount(1);
  await expect(byDept.locator("li")).toContainText("Nursing");
});
