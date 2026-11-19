"use client";

import { Loader2 } from "lucide-react";
import { errorMessage, isApiError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/** Dialog shell for create/edit forms. Keeps itself open while submitting. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pending,
  error,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  title: string;
  description?: React.ReactNode;
  submitLabel: string;
  pending: boolean;
  error?: unknown;
  onSubmit(e: React.FormEvent): void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="space-y-3">{children}</div>
          {error ? <ServerError error={error} /> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The server's message (or each validation message). */
export function ServerError({ error }: { error: unknown }) {
  const msgs = isApiError(error) && error.code === "VALIDATION" && error.messages.length > 1 ? error.messages : [errorMessage(error)];
  return (
    <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {msgs.length === 1 ? msgs[0] : (
        <ul className="list-disc pl-4">
          {msgs.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
