import type { Metadata } from "next";
import { Suspense } from "react";
import { TwoFactor } from "./two-factor";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactor />
    </Suspense>
  );
}
