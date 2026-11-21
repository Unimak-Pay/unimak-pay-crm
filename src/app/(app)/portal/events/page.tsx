import type { Metadata } from "next";
import { PortalEventsList } from "./events";

export const metadata: Metadata = { title: "Portal events" };

export default function Page() {
  return <PortalEventsList />;
}
