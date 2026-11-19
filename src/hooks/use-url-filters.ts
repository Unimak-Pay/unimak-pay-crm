"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

const NO_DEFAULTS = {};

/**
 * Filters live in the URL so links are shareable. `keys` lists the params this page owns;
 * values are strings ("" / missing = unset). Pass `keys` and `defaults` as module-level
 * constants so they are stable.
 * Components using this must sit inside a <Suspense> boundary (useSearchParams).
 */
export function useUrlFilters<K extends string>(keys: readonly K[], defaults: Partial<Record<K, string>> = NO_DEFAULTS) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const values = useMemo(() => {
    const out = {} as Record<K, string>;
    for (const k of keys) out[k] = params.get(k) ?? defaults[k] ?? "";
    return out;
  }, [params, keys, defaults]);

  const replace = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const set = useCallback(
    (patch: Partial<Record<K, string | null | undefined>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch) as [K, string | null | undefined][]) {
        if (v === undefined || v === null || v === "" || v === defaults[k]) next.delete(k);
        else next.set(k, v);
      }
      replace(next);
    },
    [params, defaults, replace],
  );

  const reset = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    for (const k of keys) next.delete(k);
    replace(next);
  }, [params, keys, replace]);

  const active = keys.some((k) => (params.get(k) ?? "") !== "");
  return { values, set, reset, active };
}

/** Drops empty values so they don't reach the query string / cache key. */
export function compact<T extends Record<string, unknown>>(o: T): { [K in keyof T]?: Exclude<T[K], "" | null> } {
  const out: { [K in keyof T]?: Exclude<T[K], "" | null> } = {};
  for (const [k, v] of Object.entries(o)) if (v !== "" && v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
  return out;
}
