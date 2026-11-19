import type { Metadata } from "next";
import { UserDetail } from "./user-detail";

export const metadata: Metadata = { title: "Admin user" };

export default function Page() {
  return <UserDetail />;
}
