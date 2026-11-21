import { expect, test, type Page } from "@playwright/test";
import { PERSONA, signIn } from "./helpers";

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
/** Rows of the students table (not the empty-state row, nor any other table on the page). */
const listRows = (page: Page) =>
  page
    .locator("main table")
    .filter({ has: page.getByRole("columnheader", { name: "Last payment" }) })
    .locator("tbody tr")
    .filter({ has: page.locator("td >> nth=1") });
const kpi = async (page: Page, id: string) => Number((await page.getByTestId(id).locator("div").nth(1).innerText()).replace(/[^\d]/g, ""));
const cell = (page: Page, department: string, level: number) => page.locator(`[data-testid="heat-cell"][data-department="${department}"][data-level="${level}"]`);

test.describe("outstanding", () => {
  test("department × level heat map, totals, by fee, applicants, and the not-billed warning", async ({ page }) => {
    await signIn(page, PERSONA.auditor);
    await nav(page).getByRole("link", { name: "Outstanding" }).click();
    await expect(page.getByRole("heading", { name: "Outstanding" })).toBeVisible();
    await expect(page.getByTestId("portal-sync")).toHaveText(/Last update from the portal: 5 min ago/);

    // Law, Nursing, Computer Science, IT, Economics × levels 1–4; Mass Communication levels 1–2 only (no faculty yet)
    await expect(page.getByTestId("heat-row")).toHaveCount(6);
    await expect(page.getByTestId("heat-cell")).toHaveCount(22);
    const massComm = page.getByTestId("heat-row").filter({ hasText: "MASS-COMM" });
    await expect(massComm.locator("td")).toHaveText([/SLE/, /SLE/, "—", "—"]);
    await expect(page.getByRole("columnheader", { name: "Level 4" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "No faculty yet" })).toBeVisible();

    // colour follows the collection rate the cell shows
    for (const c of await page.getByTestId("heat-cell").all()) {
      const pct = Number(/(\d+)% collected/.exec(await c.innerText())![1]);
      await expect(c).toHaveAttribute("data-bin", String(Math.min(4, Math.floor(pct / 20))));
    }

    // KPI cards from totals
    const students = await kpi(page, "kpi-students");
    expect(students).toBeGreaterThan(50);
    await expect(page.getByTestId("kpi-students")).toContainText("active in the roster");
    await expect(page.getByTestId("kpi-overdue")).toContainText(/students past a due date/);

    // per-fee table and applicants by status
    await expect(page.getByTestId("by-fee-row")).toHaveCount(4);
    await expect(page.getByTestId("by-fee-row").filter({ hasText: "Tuition 2025/26" })).toContainText("31 Jan 2026");
    await expect(page.getByTestId("applicant-status-row")).toHaveText([/ADMITTED/, /APPLIED/, /REJECTED/, /WITHDRAWN/]);

    // includeInactive: the five suspended / withdrawn / graduated students with fees join the totals
    await page.getByRole("switch", { name: "Include inactive students" }).click();
    await expect(page).toHaveURL(/includeInactive=true/);
    await expect.poll(() => kpi(page, "kpi-students")).toBe(students + 5);
    await expect(page.getByText(/^As of .*Includes suspended/)).toBeVisible();

    // three active students with nothing billed: the warning links to them
    const warning = page.getByTestId("not-billed-warning");
    await expect(warning).toContainText("3 active students have no fees: check rate rules");
    await warning.getByRole("link", { name: "See who" }).click();
    await expect(page).toHaveURL(/\/students\?.*standing=NOT_BILLED/);
    await expect(page).not.toHaveURL(/includeInactive/);
    await expect(listRows(page)).toHaveCount(3);
    await expect(page.locator('[data-standing="NOT_BILLED"]')).toHaveCount(3);
  });

  test("a fee filter narrows the report; it lives in the URL", async ({ page }) => {
    await signIn(page, PERSONA.auditor, { next: "/students/outstanding" });
    await expect(page.getByTestId("heat-cell")).toHaveCount(22);
    await page.getByTestId("by-fee-row").filter({ hasText: "Department levy 2026/27" }).getByRole("button").click();
    await expect(page).toHaveURL(/feeId=/);
    // the levy only applies to Computer Science
    await expect(page.getByTestId("heat-row")).toHaveCount(1);
    await expect(page.getByTestId("heat-row")).toContainText("Computer Science");
    await expect(page.getByTestId("by-fee-row")).toHaveCount(1);
    await expect(page.getByRole("combobox", { name: "Fee", exact: true })).toHaveText("Department levy 2026/27");

    await page.reload();
    await expect(page.getByTestId("heat-row")).toHaveCount(1);
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByTestId("heat-row")).toHaveCount(6);
  });

  test("a cell drills into the students list with its filters; a count adds the standing", async ({ page }) => {
    await signIn(page, PERSONA.auditor, { next: "/students/outstanding" });
    const c = cell(page, "COMPUTING", 3);
    const n = Number(/(\d+) students?/.exec(await c.innerText())![1]);
    const overdue = Number(/(\d+) overdue/.exec(await c.innerText())![1]);
    expect(overdue).toBeGreaterThan(0);

    await c.getByRole("link", { name: /Show students$/ }).click();
    await expect(page).toHaveURL(/\/students\?/);
    await expect(page).toHaveURL(/department=COMPUTING/);
    await expect(page).toHaveURL(/level=3/);
    await expect(page).toHaveURL(/kind=STUDENT/);
    await expect(listRows(page)).toHaveCount(n);
    for (const r of await listRows(page).all()) await expect(r).toContainText("Computer Science");

    await page.getByRole("link", { name: "Outstanding" }).first().click();
    await cell(page, "COMPUTING", 3).getByRole("link", { name: new RegExp(`^${overdue} overdue in`) }).click();
    await expect(page).toHaveURL(/standing=OVERDUE/);
    await expect(listRows(page)).toHaveCount(overdue);
    await expect(listRows(page).first()).toContainText("Overdue");
  });

  test("a head of department only gets their department", async ({ page }) => {
    await signIn(page, PERSONA.hod, { next: "/students/outstanding" });
    await expect(page.getByTestId("heat-row")).toHaveCount(1);
    await expect(page.getByTestId("heat-row")).toContainText("Computer Science");
    await expect(page.getByText("Only Computer Science.")).toBeVisible();
  });
});

test.describe("students list", () => {
  test("columns, masked phones, search, sort and cursor paging with the same sort", async ({ page }) => {
    await signIn(page, PERSONA.auditor);
    await nav(page).getByRole("link", { name: "Students", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Students", exact: true })).toBeVisible();
    for (const h of ["Ref", "Name", "Phone", "Department", "Level", "Status", "Billed", "Collected", "Balance", "Standing", "Last payment"])
      await expect(page.getByRole("columnheader", { name: h })).toBeVisible();

    // default: highest balance first, 50 a page
    await expect(listRows(page)).toHaveCount(50);
    const balances = await listRows(page).locator("td:nth-child(9)").allInnerTexts();
    const minor = balances.map((b) => Number(b.replace(/[^\d]/g, "")));
    expect([...minor].sort((a, b) => b - a)).toEqual(minor);
    for (const phone of (await listRows(page).locator("td:nth-child(3)").allInnerTexts()).slice(0, 5)) expect(phone).toMatch(/^\+232\*+\d{3}$/);

    // export only with payments.export (the auditor has none)
    await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);

    // sort by name, then load more: the next page continues in name order
    await page.getByRole("combobox", { name: "Sort" }).click();
    await page.getByRole("option", { name: "Name" }).click();
    await expect(page).toHaveURL(/sort=name/);
    await expect(page.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending");
    await page.getByRole("button", { name: "Load more" }).click();
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
    const names = await listRows(page).locator("td:nth-child(2) .truncate").allInnerTexts();
    expect(names.length).toBeGreaterThan(50);
    expect([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(names);

    // search by ref
    await page.getByLabel("Ref or name").fill("UNI-2025-0100");
    await page.getByLabel("Ref or name").press("Enter");
    await expect(page).toHaveURL(/q=UNI-2025-0100/);
    await expect(listRows(page)).toHaveCount(1);
  });

  test("CSV export with the current filters for admins with payments.export", async ({ page }) => {
    await signIn(page, PERSONA.finance, { next: "/students?department=LAW&standing=PAID" });
    await expect(page.getByRole("heading", { name: "Students", exact: true })).toBeVisible();
    await expect(listRows(page).first()).toBeVisible();
    const rows = await listRows(page).count();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^unimak-payers-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = (await (await file.createReadStream()).toArray()).join("");
    const lines = text.trim().split(/\r?\n/);
    expect(lines[0].replace(/^﻿/, "")).toBe(
      "kind,ref,full_name,phone_masked,program,department,department_name,faculty,level,enrolment_status,applicant_status,obligations,billed_sle,collected_sle,balance_sle,standing,overdue,overdue_sle,last_payment_at,payer_id",
    );
    expect(lines).toHaveLength(rows + 1);
    for (const l of lines.slice(1)) expect(l).toMatch(/,LAW,Law,.*,PAID,/);
  });
});

test.describe("student detail", () => {
  test("full phone with copy, totals, obligation cards with ledger and payments, receipts, portal events, linked applicant", async ({ page }) => {
    await signIn(page, PERSONA.auditor, { next: "/students?q=UNI-2025-0100" });
    await expect(listRows(page)).toHaveCount(1);
    const masked = await listRows(page).locator("td:nth-child(3)").innerText();
    await listRows(page).first().click();
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);

    // the full number here, masked in the list; copyable
    const phone = page.getByRole("button", { name: /^Copy \+232\d{8}$/ });
    await expect(phone).toBeVisible();
    const full = (await phone.getAttribute("aria-label"))!.replace("Copy ", "");
    expect(masked).toBe(`${full.slice(0, 4)}*****${full.slice(-3)}`);

    const cards = page.getByTestId("obligation-card");
    expect(await cards.count()).toBeGreaterThan(0);
    const first = cards.first();
    await expect(first).toContainText(/Billed.*Collected.*Balance.*Minimum next payment/s);
    await expect(first.getByTestId("ledger-entry").first()).toHaveAttribute("data-type", "CHARGE");

    // receipts link to the payment
    const receipt = page.getByTestId("receipt-row").first();
    const number = await receipt.getByRole("link").innerText();
    await receipt.getByRole("link").click();
    await expect(page).toHaveURL(/\/payments\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("button", { name: `Copy ${number}` })).toBeVisible();
    await page.goBack();

    // what the portal sent for this ref; the event log link needs portal.read (the auditor has it)
    await expect(page.getByTestId("payer-portal-event")).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Event log" })).toHaveAttribute("href", "/portal/events?ref=UNI-2025-0100");

    // came from an application: linked both ways
    await page.getByTestId("linked-payer").click();
    await expect(page.getByText("Applicant", { exact: true })).toBeVisible();
    await expect(page.getByTestId("linked-payer")).toHaveText("UNI-2025-0100");
  });

  test("a head of department: no event log link without portal.read; 404 outside their departments", async ({ page, browser }, info) => {
    // a Law student's id, as the auditor sees it
    await signIn(page, PERSONA.auditor, { next: "/students?department=LAW" });
    await listRows(page).first().click();
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
    const lawStudent = new URL(page.url()).pathname;

    const ctx = await browser.newContext({ baseURL: info.project.use.baseURL });
    const hod = await ctx.newPage();
    await signIn(hod, PERSONA.hod, { next: "/students?q=UNI-2025-0100" });
    await expect(listRows(hod)).toHaveCount(1);
    await listRows(hod).first().click();
    await expect(hod.getByTestId("obligation-card").first()).toBeVisible();
    await expect(hod.getByRole("link", { name: "Event log" })).toHaveCount(0);

    await hod.goto(lawStudent);
    await expect(hod.getByText("Student not found")).toBeVisible();
    await expect(hod.getByText("They may be outside your departments.")).toBeVisible();
    await ctx.close();
  });
});
