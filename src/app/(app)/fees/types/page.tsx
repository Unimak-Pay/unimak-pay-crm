import type { Metadata } from "next";
import { FeeTypes } from "./fee-types";

export const metadata: Metadata = { title: "Fee types" };

export default function FeeTypesPage() {
  return <FeeTypes />;
}
