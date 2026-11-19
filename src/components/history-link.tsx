"use client";

import { History } from "lucide-react";
import Link from "next/link";
import { Can } from "@/components/permission";
import { Button } from "@/components/ui/button";

/** "History": the audit log filtered to one entity. Hidden without audit.read. */
export function HistoryLink({ entity, entityId }: { entity: string; entityId: string }) {
  return (
    <Can op="adminAuditLog">
      <Button asChild variant="outline" size="sm">
        <Link href={`/audit?entity=${encodeURIComponent(entity)}&entityId=${encodeURIComponent(entityId)}`}>
          <History aria-hidden /> History
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
