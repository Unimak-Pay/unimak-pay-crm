import type { Metadata } from "next";
import { FeeDetailPage } from "./fee-detail";

export const metadata: Metadata = { title: "Fee" };

export default function FeePage() {
  return <FeeDetailPage />;
}
