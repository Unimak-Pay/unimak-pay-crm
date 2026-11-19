"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { classifyLinkError, type LinkType, type VerifyLinkResult } from "./email-link-shared";

/**
 * Exchanges an emailed token_hash (invite / recovery) for a session, server side, so
 * @supabase/ssr writes the session cookies on this response. Only ever called from a
 * button press (a POST): link scanners that GET the page never reach it.
 * Returns no tokens to the caller; the browser client reads the session from the cookies.
 */
export async function verifyEmailLinkAction(tokenHash: string, type: LinkType): Promise<VerifyLinkResult> {
  if (!tokenHash || (type !== "invite" && type !== "recovery")) return { ok: false, reason: "expired" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, reason: "other", message: "Sign-in is not configured on this deployment." };

  const jar = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) jar.set(name, value, options);
      },
    },
  });
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return classifyLinkError(error);
  return { ok: true };
}
