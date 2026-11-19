import { expect, type Page } from "@playwright/test";

/** Mock personas (src/mocks/db.ts). Any password works except "wrong"; TOTP is 123456. */
export const PERSONA = {
  super: "super@unimak.test",
  bursar: "bursar@unimak.test",
  finance: "finance@unimak.test",
  hod: "hod@unimak.test",
  auditor: "auditor@unimak.test",
  stranger: "someone@example.test",
} as const;
export const TOTP = "123456";

export async function signIn(page: Page, email: string, opts: { totp?: boolean; next?: string } = {}) {
  await page.goto(opts.next ? `/sign-in?next=${encodeURIComponent(opts.next)}` : "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("mock-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  if (opts.totp) {
    await expect(page.getByText("Enter the 6-digit code")).toBeVisible();
    await page.getByLabel("6-digit code").fill(TOTP);
  }
}

export async function expectSignedIn(page: Page, email: string) {
  await expect(page.getByRole("button", { name: email })).toBeVisible();
}
