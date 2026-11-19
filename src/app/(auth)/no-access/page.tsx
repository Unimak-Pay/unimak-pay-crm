import type { Metadata } from "next";
import { NoAccess } from "./no-access";

export const metadata: Metadata = { title: "No access" };

export default function NoAccessPage() {
  return <NoAccess />;
}
