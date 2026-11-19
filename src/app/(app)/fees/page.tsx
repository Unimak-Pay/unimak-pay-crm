import type { Metadata } from "next";
import { FeesList } from "./fees-list";

export const metadata: Metadata = { title: "Fees" };

export default function FeesPage() {
  return <FeesList />;
}
