import type { Metadata } from "next";
import { StudentsList } from "./students-list";

export const metadata: Metadata = { title: "Students" };

export default function Page() {
  return <StudentsList />;
}
