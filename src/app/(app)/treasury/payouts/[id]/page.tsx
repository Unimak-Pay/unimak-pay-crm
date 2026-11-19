import type { Metadata } from "next";
import { PayoutDetail } from "../payouts";

export const metadata: Metadata = { title: "Payout" };

export default function Page() {
  return <PayoutDetail />;
}
