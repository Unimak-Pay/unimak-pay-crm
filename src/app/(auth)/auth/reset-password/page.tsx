import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailLinkFlow } from "@/auth/email-link-flow";
import { EXPIRED_RESET_MESSAGE } from "@/auth/email-link-shared";

export const metadata: Metadata = { title: "Reset password" };

/** Public. Same rule as accept-invite: only the button exchanges the token. */
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <EmailLinkFlow
        type="recovery"
        copy={{
          title: "Reset your password",
          intro: "Continue to choose a new password for UNIMAK Fees Admin.",
          button: "Continue",
          expired: EXPIRED_RESET_MESSAGE,
          expiredLink: { href: "/auth/forgot-password", label: "Request a new link" },
          passwordTitle: "Choose a new password",
        }}
      />
    </Suspense>
  );
}
