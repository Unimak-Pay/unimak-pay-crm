"use client";

import { useEffect, useState } from "react";

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === "msw";

/**
 * With NEXT_PUBLIC_API_MOCKING=msw, starts the MSW service worker (admin API + Supabase
 * auth mocks) before anything renders. Otherwise renders children straight away and the
 * mock code is never loaded.
 */
export function MockGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!MOCKING);
  useEffect(() => {
    if (!MOCKING) return;
    let cancelled = false;
    import("./browser")
      .then(({ startMocking }) => startMocking())
      .then(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!ready) return null;
  return <>{children}</>;
}
