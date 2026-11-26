import type { Metadata } from "next";
import { ClearancePolicyPage } from "./clearance";

export const metadata: Metadata = { title: "Exam clearance" };

export default function Page() {
  return <ClearancePolicyPage />;
}
