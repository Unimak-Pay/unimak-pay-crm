"use client";

import { forwardRef } from "react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { formatSleNumber, parseSleInput } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Major-unit text ("1,500.50") that must parse to a positive minor-unit amount. */
export const zSle = z.string().superRefine((v, ctx) => {
  const r = parseSleInput(v);
  if (!r.ok) ctx.addIssue({ code: "custom", message: r.error });
});
/** Same, but empty is allowed (optional amount). */
export const zSleOptional = z.string().superRefine((v, ctx) => {
  if (v.trim() === "") return;
  const r = parseSleInput(v);
  if (!r.ok) ctx.addIssue({ code: "custom", message: r.error });
});

/** Form value → minor units (call only after validation). */
export function toMinor(v: string): string {
  const r = parseSleInput(v);
  if (!r.ok) throw new Error(r.error);
  return r.minor;
}
export function toMinorOrNull(v: string): string | null {
  return v.trim() === "" ? null : toMinor(v);
}
/** Minor units → what the input shows when editing ("1500.50"). */
export function toMajorInput(minor: string | null | undefined): string {
  return minor ? formatSleNumber(minor).replace(/,/g, "") : "";
}

/** Text input with an SLE prefix; the user types major units. */
export const MoneyInput = forwardRef<HTMLInputElement, React.ComponentProps<typeof Input>>(function MoneyInput({ className, ...props }, ref) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">SLE</span>
      <Input ref={ref} inputMode="decimal" autoComplete="off" className={cn("pl-10 text-right tabular-nums", className)} {...props} />
    </div>
  );
});
