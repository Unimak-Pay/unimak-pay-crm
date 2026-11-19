"use client";

import { Lock } from "lucide-react";
import { OPERATIONS, type OperationId, type Permission } from "@/api/permissions.gen";
import { useAuth } from "@/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** The permission an operation needs, straight from openapi.yaml `x-permission`. */
export function permissionFor(op: OperationId): Permission | null {
  return OPERATIONS[op].permission;
}

export function useCanOp() {
  const { can } = useAuth();
  return (op: OperationId) => can(permissionFor(op));
}

/** Renders children only when the admin may call `op` (navigation, whole sections). */
export function Can({ op, children, fallback = null }: { op: OperationId; children: React.ReactNode; fallback?: React.ReactNode }) {
  const canOp = useCanOp();
  return <>{canOp(op) ? children : fallback}</>;
}

type GatedButtonProps = React.ComponentProps<typeof Button> & { op: OperationId; disabledReason?: string | null };

/**
 * A button for an action. If the admin lacks the operation's permission it stays visible
 * but disabled, with a tooltip naming the missing permission. `disabledReason` disables
 * it for other reasons (e.g. "Only FAILED transfers can be retried").
 */
export function GatedButton({ op, disabledReason, disabled, children, ...props }: GatedButtonProps) {
  const canOp = useCanOp();
  const permission = permissionFor(op);
  const allowed = canOp(op);
  const reason = !allowed ? `Requires the ${permission} permission` : disabledReason;
  if (!reason) return <Button disabled={disabled} {...props}>{children}</Button>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span: disabled buttons don't fire pointer events, so the tooltip needs a wrapper */}
        <span tabIndex={0} className="inline-flex">
          <Button disabled {...props} aria-disabled>
            {!allowed && <Lock aria-hidden />}
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

/** Page-level guard: shows a no-access state instead of the page. */
export function RequireOp({ op, children }: { op: OperationId; children: React.ReactNode }) {
  const canOp = useCanOp();
  if (canOp(op)) return <>{children}</>;
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border p-6 text-center">
      <Lock className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden />
      <h2 className="font-medium">You don&apos;t have access to this page</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        It needs the <code className="rounded bg-muted px-1">{permissionFor(op)}</code> permission. Ask a super admin if you
        need it.
      </p>
    </div>
  );
}
