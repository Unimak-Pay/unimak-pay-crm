import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailLinkFlow } from "@/auth/email-link-flow";
import { EXPIRED_LINK_MESSAGE } from "@/auth/email-link-shared";

export const metadata: Metadata = { title: "Accept invitation" };

/** Public. Rendering never touches the token (link scanners); the button does. */
export default function AcceptInvitePage() {
  return (
    <Suspense>
      <EmailLinkFlow
        type="invite"
        copy={{
          title: "Welcome to UNIMAK Fees Admin",
          intro: "You've been invited to the University of Makeni fee collections dashboard. Accept to choose your password.",
          button: "Accept invitation",
          expired: EXPIRED_LINK_MESSAGE,
          expiredLink: { href: "/sign-in", label: "Go to sign in" },
          passwordTitle: "Choose your password",
        }}
      />
    </Suspense>
  );
}
