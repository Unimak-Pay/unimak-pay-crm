import type { Metadata } from "next";
import { Accounts } from "./accounts";

export const metadata: Metadata = { title: "Accounts" };

export default function Page() {
  return <Accounts />;
}
