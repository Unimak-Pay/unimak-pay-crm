import { AppShell } from "@/components/shell/app-shell";

// Client-gated by the Supabase session (nothing to prerender before auth resolves).
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
