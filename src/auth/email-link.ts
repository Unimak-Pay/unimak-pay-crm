"use client";

import { getSupabase } from "@/lib/supabase";
import { verifyEmailLinkAction } from "./email-link-action";
import { classifyLinkError, type LinkType, type VerifyLinkResult } from "./email-link-shared";

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === "msw";

/**
 * Called only from the "Accept invitation" / "Continue" button, never on render.
 * Real mode: the server action (sets @supabase/ssr cookies). Mock mode: Supabase Auth is faked by
 * MSW in the browser, which a server action can't reach, so the browser client verifies instead.
 */
export async function verifyEmailLink(tokenHash: string, type: LinkType): Promise<VerifyLinkResult> {
  if (!tokenHash) return { ok: false, reason: "expired" };
  try {
    if (MOCKING) {
      const { error } = await getSupabase().auth.verifyOtp({ token_hash: tokenHash, type });
      return error ? classifyLinkError(error) : { ok: true };
    }
    const r = await verifyEmailLinkAction(tokenHash, type);
    // The cookies were set by the action's response; make the browser client load them.
    if (r.ok) await getSupabase().auth.getSession();
    return r;
  } catch {
    return { ok: false, reason: "other", message: "Network error. Check your connection and try again." };
  }
}

export async function setNewPassword(password: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

/** Always resolves: the page shows the same message whatever happens (no account enumeration). */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await getSupabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/reset-password` });
  } catch {
    /* same message either way */
  }
}
