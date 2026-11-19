import type { Metadata } from "next";
import { OutboxDetail } from "../outbox";

export const metadata: Metadata = { title: "Outbox message" };

export default function Page() {
  return <OutboxDetail />;
}
