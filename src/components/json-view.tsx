"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Pretty-printed JSON with a copy button. Shows exactly what the API returned. */
export function JsonView({ value, className, maxHeight = "28rem" }: { value: unknown; className?: string; maxHeight?: string }) {
  const [copied, setCopied] = useState(false);
  const text = value === undefined ? "undefined" : JSON.stringify(value, null, 2);
  return (
    <div className={cn("relative rounded-md border bg-muted/40", className)}>
      <Button
        size="icon-xs"
        variant="ghost"
        className="absolute right-1.5 top-1.5"
        aria-label="Copy JSON"
        onClick={() =>
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          })
        }
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
      <pre className="overflow-auto p-3 pr-9 font-mono text-xs leading-relaxed" style={{ maxHeight }}>
        {text}
      </pre>
    </div>
  );
}
