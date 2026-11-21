import type { Metadata } from "next";
import { Outstanding } from "./outstanding";

export const metadata: Metadata = { title: "Outstanding" };

export default function Page() {
  return <Outstanding />;
}
