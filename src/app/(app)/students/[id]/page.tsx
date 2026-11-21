import type { Metadata } from "next";
import { StudentDetail } from "./student-detail";

export const metadata: Metadata = { title: "Student" };

export default function Page() {
  return <StudentDetail />;
}
