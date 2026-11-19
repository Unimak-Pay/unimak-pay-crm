import { setupWorker } from "msw/browser";
import { apiHandlers } from "./handlers";
import { supabaseHandlers } from "./supabase";

let started: Promise<void> | null = null;

/** Idempotent: React Strict Mode runs effects twice in development. */
export function startMocking(): Promise<void> {
  started ??= (async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://mock.supabase.test";
    const worker = setupWorker(...supabaseHandlers(supabaseUrl), ...apiHandlers);
    await worker.start({
      // Next.js assets, HMR, fonts and anything not mocked go to the network untouched.
      onUnhandledFrame: "bypass",
      quiet: true,
    });
    console.info(
      "[mocks] MSW is mocking the admin API and Supabase auth. Personas: super@ / bursar@ / finance@ / hod@ / auditor@unimak.test, TOTP 123456.",
    );
  })();
  return started;
}
