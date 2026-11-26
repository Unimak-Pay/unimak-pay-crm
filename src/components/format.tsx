"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatSle } from "@/lib/money";
import { formatDateTime, formatDay } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Money: right-aligned by the caller's cell, tabular figures always. */
export function Money({ minor, className, signed }: { minor: string | null | undefined; className?: string; signed?: boolean }) {
  if (minor === null || minor === undefined || minor === "") return <span className="text-muted-foreground">—</span>;
  const neg = minor.startsWith("-");
  return (
    <span className={cn("tabular-nums whitespace-nowrap", signed && neg && "text-red-600 dark:text-red-400", className)}>
      {formatSle(minor)}
    </span>
  );
}

/** Freetown time, ISO on hover. */
export function DateTime({ iso, className }: { iso: string | null | undefined; className?: string }) {
  if (!iso) return <span className="text-muted-foreground">—</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={iso} className={cn("whitespace-nowrap tabular-nums", className)}>
          {formatDateTime(iso)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{iso}</TooltipContent>
    </Tooltip>
  );
}

export function Day({ day }: { day: string | null | undefined }) {
  if (!day) return <span className="text-muted-foreground">—</span>;
  return (
    <time dateTime={day} className="whitespace-nowrap tabular-nums" title={day}>
      {formatDay(day)}
    </time>
  );
}

const GREEN = new Set(["COMPLETED", "SENT", "PROCESSED", "ACTIVE", "RESOLVED", "AUTO_RESOLVED", "PAID", "APPLIED"]);
const AMBER = new Set(["PENDING", "INITIATED", "SUBMITTED", "PROCESSING", "REQUESTED", "RUNNING", "RECEIVED", "DRAFT", "OPEN", "SUSPENDED"]);
const RED = new Set(["FAILED", "DEAD", "UNMATCHED", "REJECTED"]);
// everything else (EXPIRED, CLOSED, IGNORED, …) is grey

export const STATUS_CLASS = {
  green: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  red: "border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  grey: "border-transparent bg-muted text-muted-foreground",
  blue: "border-transparent bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  muted: "border-border bg-transparent text-muted-foreground",
};

export function statusTone(status: string): keyof typeof STATUS_CLASS {
  if (GREEN.has(status)) return "green";
  if (AMBER.has(status)) return "amber";
  if (RED.has(status)) return "red";
  return "grey";
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("font-mono text-[11px] tracking-tight", STATUS_CLASS[statusTone(status)])}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

/** A ref or id in mono with a copy button. */
export function CopyValue({ value, className, truncate }: { value: string | null | undefined; className?: string; truncate?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 font-mono text-xs", className)}>
      <span className={cn(truncate && "truncate")} title={value}>
        {value}
      </span>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Copy ${value}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
      </button>
    </span>
  );
}

type PaymentStatus = "INITIATED" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "EXPIRED";

/** What a payment's status means to a person (docs/payment-lifecycle.md: payments no longer expire). */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  INITIATED: "Starting",
  PENDING: "Awaiting payment",
  PROCESSING: "Processing",
  COMPLETED: "Paid",
  FAILED: "Failed",
  EXPIRED: "Expired (old)",
};
const PAYMENT_TONE: Record<PaymentStatus, keyof typeof STATUS_CLASS> = {
  INITIATED: "grey",
  PENDING: "grey",
  PROCESSING: "blue",
  COMPLETED: "green",
  FAILED: "red",
  EXPIRED: "muted",
};
const PAYMENT_HINT: Partial<Record<PaymentStatus, string>> = {
  PENDING: "Created, not paid yet. Deleted after 7 days if nobody pays.",
  PROCESSING: "Monime is collecting the money.",
  EXPIRED: "Payments made before 28 Nov 2026 expired after 15 minutes.",
};

/** A payment's status in words. Other entities (transfers, outbox, …) keep StatusBadge. */
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="outline" data-status={status} title={PAYMENT_HINT[status]} className={cn("whitespace-nowrap text-[11px]", STATUS_CLASS[PAYMENT_TONE[status]])}>
      {PAYMENT_STATUS_LABEL[status]}
    </Badge>
  );
}
