import type { Metadata } from "next";
import { NeedsReviewList } from "./needs-review";

export const metadata: Metadata = { title: "Needs review" };

export default function Page() {
  return <NeedsReviewList />;
}
