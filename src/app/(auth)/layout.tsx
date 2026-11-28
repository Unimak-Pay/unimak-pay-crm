import { Logo } from "@/components/shell/logo";

// Client-gated by the Supabase session (nothing to prerender before auth resolves).
export const instant = false;

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="mb-6 flex items-center gap-2 font-semibold">
        <Logo size={40} />
        UNIMAK Pay <span className="text-sm font-normal text-muted-foreground">admin</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-6 text-xs text-muted-foreground">University of Makeni · finance office</p>
    </div>
  );
}
