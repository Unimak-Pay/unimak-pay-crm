import type { Metadata } from "next";
import { TransfersList } from "./transfers";

export const metadata: Metadata = { title: "Commission transfers" };

export default function Page() {
  return <TransfersList />;
}
