import type { Metadata } from "next";
import { PayoutsList } from "./payouts";

export const metadata: Metadata = { title: "Payouts" };

export default function Page() {
  return <PayoutsList />;
}
