import Image from "next/image";
import { cn } from "@/lib/utils";

/** The University of Makeni crest. Transparent, so dark mode gets a white tile behind it to keep the outline visible. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-md dark:bg-white dark:p-0.5", className)} style={{ width: size, height: size }}>
      <Image src="/unimak-crest.png" alt="" width={size} height={size} className="size-full object-contain" priority />
    </span>
  );
}
