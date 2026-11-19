"use client";

import { History } from "lucide-react";
import Link from "next/link";
import { Can } from "@/components/permission";
import { Button } from "@/components/ui/button";

/** "History": the audit log filtered to one entity. Hidden without audit.read. */
export function HistoryLink({ entity, entityId, iconOnly }: { entity: string; entityId: string; iconOnly?: boolean }) {
  const href = `/audit?entity=${encodeURIComponent(entity)}&entityId=${encodeURIComponent(entityId)}`;
  return (
    <Can op="adminAuditLog">
      <Button asChild variant={iconOnly ? "ghost" : "outline"} size={iconOnly ? "icon-sm" : "sm"}>
        <Link href={href} aria-label={iconOnly ? "History" : undefined} title={iconOnly ? "History" : undefined}>
          <History aria-hidden /> {!iconOnly && "History"}
        </Link>
      </Button>
    </Can>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-1 inline-block text-xs text-muted-foreground hover:text-foreground">
      ← {children}
    </Link>
  );
}
