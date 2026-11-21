"use client";

import { useQuery } from "@tanstack/react-query";
import { AlarmClock } from "lucide-react";
import { useId } from "react";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { FilterSelect } from "@/components/filters";
import { STATUS_CLASS } from "@/components/format";
import { useCanOp } from "@/components/permission";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { LEVELS, STANDING_LABEL } from "./drill";

type Standing = components["schemas"]["Standing"];

const STANDING_TONE: Record<Standing, keyof typeof STATUS_CLASS> = { PAID: "green", PART_PAID: "amber", UNPAID: "red", NOT_BILLED: "grey" };

export function StandingBadge({ standing }: { standing: Standing }) {
  return (
    <Badge variant="outline" data-standing={standing} className={cn("whitespace-nowrap text-[11px]", STATUS_CLASS[STANDING_TONE[standing]])}>
      {STANDING_LABEL[standing]}
    </Badge>
  );
}

/** Overdue never shows by colour alone: icon + word. */
export function OverdueFlag({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1 whitespace-nowrap text-[11px]", STATUS_CLASS.red, className)}>
      <AlarmClock aria-hidden /> Overdue
    </Badge>
  );
}

type FeeOption = { id: string; name: string; period: string; feeTypeCode: string };

/**
 * Fee choices: the fee list when the admin may read fees; otherwise what the report itself
 * listed (`byFee`), so finance officers, who have reports.read but not fees.read, still get a picker.
 */
function useFeeOptions(fallback: FeeOption[] | undefined): FeeOption[] | undefined {
  const canOp = useCanOp();
  const allowed = canOp("adminFees");
  const fees = useQuery({ queryKey: qk.fees({}), queryFn: () => call(api.GET("/v1/admin/fees", { params: { query: {} } })), enabled: allowed });
  if (!allowed) return fallback;
  return fees.data?.map((f) => ({ id: f.id, name: f.name, period: f.period, feeTypeCode: f.feeType.code }));
}

/** One fee, or a fee type and/or period. Choosing one way clears the other. */
export function FeeFilters({
  feeId,
  feeType,
  period,
  onChange,
  fallback,
}: {
  feeId: string;
  feeType: string;
  period: string;
  onChange(patch: { feeId?: string; feeType?: string; period?: string }): void;
  fallback?: FeeOption[];
}) {
  const fees = useFeeOptions(fallback) ?? [];
  // keep a selection the options don't list (yet) choosable, so the select shows it
  const withCurrent = feeId && !fees.some((f) => f.id === feeId) ? [...fees, { id: feeId, name: "Selected fee", period: "", feeTypeCode: "" }] : fees;
  const types = [...new Set([...fees.map((f) => f.feeTypeCode), feeType].filter(Boolean))].sort();
  const periods = [...new Set([...fees.map((f) => f.period), period].filter(Boolean))].sort().reverse();
  return (
    <>
      <FilterSelect
        label="Fee"
        allLabel="All fees"
        value={feeId}
        onChange={(v) => onChange({ feeId: v, feeType: "", period: "" })}
        options={withCurrent.map((f) => ({ value: f.id, label: f.name }))}
        className="max-w-64"
      />
      <FilterSelect label="Fee type" value={feeType} onChange={(v) => onChange({ feeType: v, feeId: "" })} options={types} />
      <FilterSelect label="Period" value={period} onChange={(v) => onChange({ period: v, feeId: "" })} options={periods} />
    </>
  );
}

export function LevelFilter({ value, onChange }: { value: string; onChange(v: string): void }) {
  return <FilterSelect label="Level" allLabel="All levels" value={value} onChange={onChange} options={LEVELS.map((l) => ({ value: String(l), label: `Level ${l}` }))} className="[&_button]:min-w-28" />;
}

export function IncludeInactiveSwitch({ value, onChange }: { value: boolean; onChange(v: boolean): void }) {
  const id = useId();
  return (
    <div className="flex h-8 items-center gap-2 self-end">
      <Switch id={id} checked={value} onCheckedChange={onChange} />
      <Label htmlFor={id} className="text-xs font-normal">
        Include inactive students
      </Label>
    </div>
  );
}
