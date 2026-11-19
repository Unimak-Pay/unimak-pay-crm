import type { Metadata } from "next";
import { RunDetail } from "../../details";

export const metadata: Metadata = { title: "Reconciliation run" };

export default function Page() {
  return <RunDetail />;
}
