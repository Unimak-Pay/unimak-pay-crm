"use client";

import { Building2, LogOut, Menu, Monitor, Moon, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-provider";
import { useIdleSignOut } from "@/auth/idle";
import { useCanOp } from "@/components/permission";
import { ErrorState, LoadingBlock } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { APP_NAME, AppIcon, NAV, activeHref } from "./nav";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const canOp = useCanOp();
  const active = activeHref(pathname);
  return (
    <nav aria-label="Main" className="flex flex-col gap-4 px-2 text-sm">
      {NAV.map((group, gi) => {
        const items = group.items.filter((i) => !i.op || canOp(i.op));
        if (!items.length) return null;
        return (
          <div key={gi} className="flex flex-col gap-0.5">
            {group.label && <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group.label}</div>}
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active === item.href ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  active === item.href && "bg-accent font-medium text-accent-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-4 py-3 font-semibold">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <AppIcon className="size-4" aria-hidden />
      </span>
      {APP_NAME}
      <span className="text-xs font-normal text-muted-foreground">admin</span>
    </Link>
  );
}

function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  const opts = [
    { v: "light", label: "Light", icon: Sun },
    { v: "dark", label: "Dark", icon: Moon },
    { v: "system", label: "System", icon: Monitor },
  ] as const;
  return (
    <>
      {opts.map((o) => (
        <DropdownMenuItem key={o.v} onSelect={() => setTheme(o.v)} className={cn(theme === o.v && "font-medium")}>
          <o.icon aria-hidden /> {o.label}
        </DropdownMenuItem>
      ))}
    </>
  );
}

function Header() {
  const { me, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:px-4">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Brand />
          <NavLinks onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="md:hidden">
        <span className="font-semibold">{APP_NAME}</span>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {me.departmentScoped && (
          <div className="hidden min-w-0 items-center gap-1 sm:flex" title="You see payments for these departments only">
            <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate text-xs text-muted-foreground">{me.departments.join(", ") || "No departments"}</span>
          </div>
        )}
        <Badge variant="secondary" className="hidden font-mono text-[11px] sm:inline-flex">
          {me.role.replace(/_/g, " ")}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="max-w-56">
              <UserRound aria-hidden />
              <span className="truncate">{me.email}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{me.email}</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserRound aria-hidden /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <ThemeMenuItems />
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut("user")}>
              <LogOut aria-hidden /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/** Redirects to the right auth screen unless signed in with `me` loaded. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, signOut, loadError, reload } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "signed_out") router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    else if (status === "mfa_verify" || status === "mfa_enroll") router.replace(`/sign-in/2fa?next=${encodeURIComponent(pathname)}`);
    else if (status === "not_admin") router.replace("/no-access");
  }, [status, router, pathname]);

  const onIdle = useCallback(() => void signOut("idle"), [signOut]);
  useIdleSignOut(status === "ready", onIdle);

  if (status === "error") {
    return (
      <div className="mx-auto mt-24 max-w-md px-4">
        <ErrorState error={new Error(loadError ?? "Could not load your admin profile")} onRetry={() => void reload()} />
        <div className="mt-3 text-center">
          <Button variant="link" onClick={() => void signOut("user")}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }
  if (status !== "ready") {
    return (
      <div className="mx-auto mt-24 w-full max-w-sm px-4">
        <LoadingBlock rows={3} />
      </div>
    );
  }

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col overflow-y-auto border-r bg-sidebar md:flex">
        <Brand />
        <NavLinks />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-w-0 flex-1 px-4 py-4 md:px-6">
          <Suspense fallback={<LoadingBlock />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
