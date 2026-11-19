import type { Metadata } from "next";
import { EventDetail } from "../../details";

export const metadata: Metadata = { title: "Webhook event" };

export default function Page() {
  return <EventDetail />;
}
