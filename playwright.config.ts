import { defineConfig, devices } from "@playwright/test";

// e2e runs against `next dev` with MSW mocking the admin API and Supabase auth:
// no backend, no Supabase project, and never production.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:3005", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm next dev --port 3005",
    url: "http://localhost:3005/sign-in",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_MOCKING: "msw",
      NEXT_PUBLIC_SUPABASE_URL: "https://mock.supabase.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
      UNIMAK_API_URL: "http://127.0.0.1:9", // unreachable on purpose
    },
  },
});
