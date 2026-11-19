"use client";

import { Search, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDays, daysInclusive, isDay, todayDay } from "@/lib/time";
import { cn } from "@/lib/utils";

const ALL = "__all__";

export function FilterBar({ children, onReset, active }: { children: React.ReactNode; onReset?: () => void; active?: boolean }) {
  return (
    <div className="mb-3 flex flex-wrap items-end gap-2">
      {children}
      {onReset && active && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <X aria-hidden /> Clear filters
        </Button>
      )}
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
  className,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  options: readonly (string | { value: string; label: string })[];
  allLabel?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
        <SelectTrigger id={id} size="sm" className="min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => {
            const v = typeof o === "string" ? o : o.value;
            const l = typeof o === "string" ? o.replace(/_/g, " ") : o.label;
            return (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Text filter that applies on Enter / blur (not on every keystroke). */
export function FilterSearch({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  // Follow outside changes (e.g. "Clear filters") without an effect.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const apply = () => draft.trim() !== value && onChange(draft.trim());
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          onBlur={apply}
          className="h-8 w-56 pl-7 font-mono text-xs"
        />
      </div>
    </div>
  );
}

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 366 },
];

/**
 * Calendar-day range (YYYY-MM-DD, inclusive). Native date inputs: keyboard-friendly and good
 * on phones. `maxDays` caps the span (reports allow 366).
 */
export function DayRangeFilter({
  from,
  to,
  onChange,
  maxDays,
  presets = true,
  optional,
}: {
  from: string;
  to: string;
  onChange(range: { from: string; to: string }): void;
  maxDays?: number;
  presets?: boolean;
  /** Allow an empty range (list filters); reports always have one. */
  optional?: boolean;
}) {
  const fromId = useId();
  const toId = useId();
  const today = todayDay();
  const span = isDay(from) && isDay(to) ? daysInclusive(from, to) : null;
  const error =
    span !== null && span < 1 ? "Start is after end" : span !== null && maxDays && span > maxDays ? `At most ${maxDays} days` : null;

  function set(next: { from: string; to: string }) {
    if (!optional && (!isDay(next.from) || !isDay(next.to))) return;
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={fromId} className="text-xs text-muted-foreground">
          From
        </Label>
        <Input id={fromId} type="date" value={from} max={to || today} onChange={(e) => set({ from: e.target.value, to })} className="h-8 w-38 text-xs" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={toId} className="text-xs text-muted-foreground">
          To
        </Label>
        <Input id={toId} type="date" value={to} min={from || undefined} max={today} onChange={(e) => set({ from, to: e.target.value })} className="h-8 w-38 text-xs" />
      </div>
      {presets && (
        <div className="flex gap-1" role="group" aria-label="Quick ranges">
          {PRESETS.filter((p) => !maxDays || p.days <= maxDays).map((p) => {
            const pf = addDays(today, -(p.days - 1));
            const on = from === pf && to === today;
            return (
              <Button key={p.label} size="sm" variant={on ? "secondary" : "ghost"} aria-pressed={on} onClick={() => onChange({ from: pf, to: today })}>
                {p.label}
              </Button>
            );
          })}
        </div>
      )}
      {error && (
        <p role="alert" className="pb-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
