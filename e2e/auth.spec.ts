import { expect, test } from "@playwright/test";
import { expectSignedIn, PERSONA, signIn, TOTP } from "./helpers";

test("unauthenticated visits go to sign-in and come back after", async ({ page }) => {
  await page.goto("/payments?status=FAILED");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fpayments/);
  await page.getByLabel("Email").fill(PERSONA.finance);
  await page.getByLabel("Password").fill("x");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/payments/);
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(PERSONA.finance);
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Wrong email or password" })).toBeVisible();
});

test("super admin with an authenticator enters the TOTP code", async ({ page }) => {
  await signIn(page, PERSONA.super, { totp: true });
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expectSignedIn(page, PERSONA.super);
});

test("a wrong TOTP code is refused", async ({ page }) => {
  await signIn(page, PERSONA.super);
  await page.getByLabel("6-digit code").fill("000000");
  await expect(page.getByRole("alert").filter({ hasText: "not right" })).toBeVisible();
});

test("bursar without 2FA must enroll: QR code, secret, then the code", async ({ page }) => {
  await signIn(page, PERSONA.bursar);
  await expect(page.getByText("Set up two-factor authentication")).toBeVisible();
  await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
  await expect(page.getByText("JBSWY3DPEHPK3PXP")).toBeVisible();
  await page.getByLabel("6-digit code").fill(TOTP);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expectSignedIn(page, PERSONA.bursar);
});

test("a Supabase user who is not an admin is told so and signed out", async ({ page }) => {
  await signIn(page, PERSONA.stranger);
  await expect(page).toHaveURL(/\/no-access/);
  await expect(page.getByText("Your account is not an admin. Ask a super admin to invite you.")).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("sign out from the user menu", async ({ page }) => {
  await signIn(page, PERSONA.finance);
  await page.getByRole("button", { name: PERSONA.finance }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});
