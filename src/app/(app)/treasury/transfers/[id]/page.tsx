import type { Metadata } from "next";
import { TransferDetail } from "../transfers";

export const metadata: Metadata = { title: "Transfer" };

export default function Page() {
  return <TransferDetail />;
}
