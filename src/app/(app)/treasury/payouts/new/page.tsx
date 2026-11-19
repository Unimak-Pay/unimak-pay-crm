import type { Metadata } from "next";
import { NewPayout } from "./new-payout";

export const metadata: Metadata = { title: "New payout" };

export default function Page() {
  return <NewPayout />;
}
