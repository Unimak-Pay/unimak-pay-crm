import type { Metadata } from "next";
import { Academics } from "./academics";

export const metadata: Metadata = { title: "Faculties & departments" };

export default function Page() {
  return <Academics />;
}
