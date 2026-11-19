import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { LoadingBlock } from "@/components/states";

// Client-gated by the Supabase session (nothing to prerender before auth resolves).
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    // The shell reads the pathname, which dynamic routes ([id]) only know at request time.
    <Suspense
      fallback={
        <div className="mx-auto mt-24 w-full max-w-sm px-4">
          <LoadingBlock rows={3} />
        </div>
      }
    >
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
