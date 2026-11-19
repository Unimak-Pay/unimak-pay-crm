import { describe, expect, it } from "vitest";
import { awaitingFirstSignIn, invitationToast } from "./invitation";

const email = "new@unimak.edu.sl";

describe("invitationToast", () => {
  it("SENT → success", () => {
    expect(invitationToast({ email, invitation: { status: "SENT" } })).toEqual({
      kind: "success",
      message: "Invite email sent to new@unimak.edu.sl",
      offerResend: false,
    });
  });
  it("ALREADY_REGISTERED → info", () => {
    expect(invitationToast({ email, invitation: { status: "ALREADY_REGISTERED", message: "exists" } })).toEqual({
      kind: "info",
      message: "new@unimak.edu.sl already has a sign-in and can sign in now",
      offerResend: false,
    });
  });
  it.each(["NOT_CONFIGURED", "FAILED"] as const)("%s → warning with the server's reason and a re-send offer", (status) => {
    expect(invitationToast({ email, invitation: { status, message: "Email rate limit exceeded" } })).toEqual({
      kind: "warning",
      message: "Admin created, but the invite email wasn't sent: Email rate limit exceeded",
      offerResend: true,
    });
  });
});

describe("awaitingFirstSignIn", () => {
  it("is active and never bound", () => {
    expect(awaitingFirstSignIn({ active: true, authUserId: null })).toBe(true);
    expect(awaitingFirstSignIn({ active: true, authUserId: "00000000-0000-4000-8000-000000000001" })).toBe(false);
    expect(awaitingFirstSignIn({ active: false, authUserId: null })).toBe(false);
  });
});
