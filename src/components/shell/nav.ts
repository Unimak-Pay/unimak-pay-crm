import {
  ArrowLeftRight,
  BadgeDollarSign,
  Banknote,
  FileClock,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  Layers,
  type LucideIcon,
  Receipt,
  Scale,
  Tags,
  Users,
  Wallet,
} from "lucide-react";
import type { OperationId } from "@/api/permissions.gen";

export type NavItem = { href: string; label: string; icon: LucideIcon; op: OperationId | null };
export type NavGroup = { label: string | null; items: NavItem[] };

/** Each item is shown only if the admin may call its list operation. */
export const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, op: null },
      { href: "/payments", label: "Payments", icon: Receipt, op: "adminListPayments" },
    ],
  },
  {
    label: "Fee setup",
    items: [
      { href: "/fees", label: "Fees", icon: BadgeDollarSign, op: "adminFees" },
      { href: "/fees/types", label: "Fee types", icon: Tags, op: "adminFeeTypes" },
      { href: "/academics", label: "Faculties & departments", icon: GraduationCap, op: "adminListFaculties" },
    ],
  },
  {
    label: "Treasury",
    items: [
      { href: "/treasury/accounts", label: "Accounts", icon: Wallet, op: "adminListAccounts" },
      { href: "/treasury/payouts", label: "Payouts", icon: Banknote, op: "adminListPayouts" },
      { href: "/treasury/transfers", label: "Commission transfers", icon: ArrowLeftRight, op: "adminListTransfers" },
      { href: "/treasury/outbox", label: "Outbox", icon: Inbox, op: "adminOutbox" },
    ],
  },
  {
    label: "Control",
    items: [
      { href: "/reconciliation", label: "Reconciliation", icon: Scale, op: "adminReconciliation" },
      { href: "/audit", label: "Audit log", icon: FileClock, op: "adminAuditLog" },
      { href: "/users", label: "Users", icon: Users, op: "adminListUsers" },
    ],
  },
];

/** Longest matching nav href for the current path ("/fees/types" beats "/fees"). */
export function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const g of NAV)
    for (const i of g.items) {
      const match = i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(i.href + "/");
      if (match && (!best || i.href.length > best.length)) best = i.href;
    }
  return best;
}

export const ACADEMICS_HREF = "/academics";

export const APP_NAME = "UNIMAK Pay";
export const AppIcon = Layers;
