import type { Metadata } from "next";
import { OutboxList } from "./outbox";

export const metadata: Metadata = { title: "Outbox" };

export default function Page() {
  return <OutboxList />;
}
