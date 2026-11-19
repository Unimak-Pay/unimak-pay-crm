import { expect, test, type Page } from "@playwright/test";
import { PERSONA, signIn } from "./helpers";

async function invite(page: Page, email: string) {
  await page.getByRole("button", { name: "Invite admin" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Send invite" }).click();
  await expect(dialog).toBeHidden();
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text });

test.describe("users: invitations", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, PERSONA.super, { totp: true });
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });

  test("SENT → success toast, row shows 'Invited · not signed in'", async ({ page }) => {
    await invite(page, "newbie@unimak.test");
    await expect(toast(page, "Invite email sent to newbie@unimak.test")).toHaveAttribute("data-type", "success");
    const row = page.locator("tbody tr").filter({ hasText: "newbie@unimak.test" });
    await expect(row.getByText("Invited · not signed in")).toBeVisible();
    await expect(row.getByRole("button", { name: "Re-send invite" })).toBeVisible();
  });

  test("ALREADY_REGISTERED → info toast", async ({ page }) => {
    await invite(page, "old+registered@unimak.test");
    await expect(toast(page, "old+registered@unimak.test already has a sign-in and can sign in now")).toHaveAttribute("data-type", "info");
  });

  for (const [email, reason] of [
    ["x+noconfig@unimak.test", "SUPABASE_SERVICE_ROLE_KEY is not set on the backend"],
    ["x+fail@unimak.test", "Email rate limit exceeded"],
  ] as const) {
    test(`${email.split("+")[1].split("@")[0]} → warning toast with a working Re-send`, async ({ page }) => {
      await invite(page, email);
      const t = toast(page, `Admin created, but the invite email wasn't sent: ${reason}`);
      await expect(t).toHaveAttribute("data-type", "warning");
      await t.getByRole("button", { name: "Re-send invite" }).click();
      if (email.includes("fail")) await expect(toast(page, `Invite email sent to ${email}`)).toBeVisible();
      // still not configured: the same warning comes back (sonner shows it in place)
      else await expect(toast(page, `Admin created, but the invite email wasn't sent: ${reason}`)).toBeVisible();
    });
  }

  test("Re-send from the list sends the same status toast", async ({ page }) => {
    const row = page.locator("tbody tr").filter({ hasText: "pending@unimak.test" });
    await row.getByRole("button", { name: "Re-send invite" }).click();
    await expect(toast(page, "Invite email sent to pending@unimak.test")).toBeVisible();
  });

  test("Re-send that hits 409 refreshes the user and shows why", async ({ page }) => {
    const row = page.locator("tbody tr").filter({ hasText: "race@unimak.test" });
    await expect(row.getByText("Invited · not signed in")).toBeVisible();
    await row.getByRole("button", { name: "Re-send invite" }).click();
    await expect(toast(page, "race@unimak.test has already signed in; there is nothing to re-send.")).toHaveAttribute("data-type", "error");
    await expect(row.getByText("Active")).toBeVisible();
    await expect(row.getByRole("button", { name: "Re-send invite" })).toHaveCount(0);
  });

  test("user detail shows the badge and last sign-in", async ({ page }) => {
    const href = await page.locator("tbody tr").filter({ hasText: "pending@unimak.test" }).getByRole("link", { name: "Open" }).getAttribute("href");
    await page.goto(href!);
    await expect(page).toHaveURL(/\/users\/[0-9a-f-]+$/);
    await expect(page.getByText("Invited · not signed in").first()).toBeVisible();
    await expect(page.locator("dt", { hasText: "Last sign-in" }).locator("+ dd")).toHaveText("Never");
    await expect(page.getByRole("button", { name: "Re-send invite" })).toBeVisible();
  });
});

test.describe("accept invite (public)", () => {
  const verifyCalls = (page: Page) => page.evaluate(() => (window as unknown as { __mockVerifyCalls?: string[] }).__mockVerifyCalls?.length ?? 0);

  test("opening the link does not use the token; Accept → password → signed in", async ({ page }) => {
    await page.goto("/auth/accept-invite?token_hash=invite:pending@unimak.test&type=invite");
    await expect(page.getByText("Welcome to UNIMAK Fees Admin")).toBeVisible();
    await page.waitForTimeout(500); // anything that would fire on load has fired
    expect(await verifyCalls(page)).toBe(0);

    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page.getByText("Choose your password")).toBeVisible();
    expect(await verifyCalls(page)).toBe(1);

    await page.getByLabel("New password").fill("a long enough passphrase");
    await page.getByLabel("Confirm password").fill("a long enough passphrase");
    await page.getByRole("button", { name: "Save password" }).click();
    // /me binds the invitation; FINANCE_OFFICER needs no 2FA
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "pending@unimak.test" })).toBeVisible();
  });

  test("a role that needs 2FA goes on to enrolment", async ({ page }) => {
    await page.goto("/auth/accept-invite?token_hash=invite:bursar@unimak.test&type=invite");
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page.getByLabel("New password").fill("a long enough passphrase");
    await page.getByLabel("Confirm password").fill("a long enough passphrase");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Set up two-factor authentication")).toBeVisible();
  });

  test("an expired or used link explains what to do", async ({ page }) => {
    await page.goto("/auth/accept-invite?token_hash=expired&type=invite");
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page.getByText("This invite link has expired or was already used. Ask a super admin to re-send your invitation.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to sign in" })).toBeVisible();
  });

  test("a link without token_hash shows the same message", async ({ page }) => {
    await page.goto("/auth/accept-invite?type=invite");
    await expect(page.getByText("This invite link has expired or was already used.")).toBeVisible();
    expect(await verifyCalls(page)).toBe(0);
  });

  test("an invite for someone who is not an admin ends at no-access", async ({ page }) => {
    await page.goto("/auth/accept-invite?token_hash=invite:stranger@example.test&type=invite");
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page.getByLabel("New password").fill("a long enough passphrase");
    await page.getByLabel("Confirm password").fill("a long enough passphrase");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Your account is not an admin. Ask a super admin to invite you.")).toBeVisible();
  });
});

test.describe("password reset (public)", () => {
  test("forgot password always shows the same message", async ({ page }) => {
    for (const email of ["finance@unimak.test", "nobody-here@example.test"]) {
      await page.goto("/sign-in");
      await page.getByRole("link", { name: "Forgot password?" }).click();
      await expect(page).toHaveURL(/\/auth\/forgot-password/);
      await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
      await page.getByLabel("Email", { exact: true }).filter({ visible: true }).fill(email);
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.getByRole("status")).toHaveText("If that email has an account, we've sent a reset link.");
    }
  });

  test("reset link → Continue → new password → 2FA code for an enrolled admin", async ({ page }) => {
    await page.goto("/auth/reset-password?token_hash=recovery:super@unimak.test&type=recovery");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("New password").fill("another long passphrase");
    await page.getByLabel("Confirm password").fill("another long passphrase");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Enter the 6-digit code")).toBeVisible();
  });
});
