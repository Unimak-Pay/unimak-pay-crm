export type LinkType = "invite" | "recovery";

export type VerifyLinkResult = { ok: true } | { ok: false; reason: "expired" } | { ok: false; reason: "other"; message: string };

export const EXPIRED_LINK_MESSAGE = "This invite link has expired or was already used. Ask a super admin to re-send your invitation.";
export const EXPIRED_RESET_MESSAGE = "This reset link has expired or was already used. Request a new one.";

/** Supabase answers 403 / otp_expired / "invalid" for expired, used or forged links. */
export function classifyLinkError(error: { code?: string; status?: number; message?: string }): VerifyLinkResult {
  const msg = error.message ?? "";
  if (error.code === "otp_expired" || error.status === 403 || /expired|invalid/i.test(msg)) return { ok: false, reason: "expired" };
  return { ok: false, reason: "other", message: msg || "Could not verify the link" };
}

export const MIN_PASSWORD = 12;
