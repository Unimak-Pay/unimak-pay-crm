import type { Metadata } from "next";
import { PaymentDetail } from "./payment-detail";

export const metadata: Metadata = { title: "Payment" };

export default function PaymentPage() {
  return <PaymentDetail />;
}
