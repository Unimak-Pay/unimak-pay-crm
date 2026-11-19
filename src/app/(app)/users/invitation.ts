import type { components } from "@/api/schema.gen";

type Invited = components["schemas"]["InvitedAdminUser"];

export type InvitationToast = {
  kind: "success" | "info" | "warning";
  message: string;
  /** Offer "Re-send invite" (the email did not go out). */
  offerResend: boolean;
};

/** What to tell the admin after creating a user or re-sending an invite. */
export function invitationToast(u: Pick<Invited, "email" | "invitation">): InvitationToast {
  switch (u.invitation.status) {
    case "SENT":
      return { kind: "success", message: `Invite email sent to ${u.email}`, offerResend: false };
    case "ALREADY_REGISTERED":
      return { kind: "info", message: `${u.email} already has a sign-in and can sign in now`, offerResend: false };
    case "NOT_CONFIGURED":
    case "FAILED":
      return {
        kind: "warning",
        message: `Admin created, but the invite email wasn't sent: ${u.invitation.message ?? u.invitation.status.toLowerCase().replace("_", " ")}`,
        offerResend: true,
      };
  }
}

/** Never signed in yet: the invite can (still) be re-sent. */
export function awaitingFirstSignIn(u: Pick<components["schemas"]["AdminUser"], "authUserId" | "active">): boolean {
  return u.active && u.authUserId === null;
}
