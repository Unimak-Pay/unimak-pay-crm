import type { Metadata } from "next";
import { Reconciliation } from "./reconciliation";

export const metadata: Metadata = { title: "Reconciliation" };

export default function Page() {
  return <Reconciliation />;
}
