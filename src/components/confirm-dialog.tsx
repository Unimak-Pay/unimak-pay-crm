"use client";

import { Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { errorMessage } from "@/api/errors";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  /** Say exactly what will happen: amounts, accounts, ids. */
  children: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Ask for a note (audited resolution text). Min 3, max 500 characters. */
  note?: { label: string; placeholder?: string };
  onConfirm(note: string): Promise<unknown>;
};

/**
 * Confirmation for money-moving or irreversible actions. Stays open while the request
 * runs (no double submit), shows the server's error inline, and closes on success.
 */
export function ConfirmDialog({ open, onOpenChange, title, children, confirmLabel, destructive, note, onConfirm }: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [text, setText] = useState("");
  const noteId = useId();
  const noteOk = !note || (text.trim().length >= 3 && text.trim().length <= 500);

  function change(next: boolean) {
    if (pending) return;
    if (!next) {
      setError(null);
      setText("");
    }
    onOpenChange(next);
  }

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm(text.trim());
      setText("");
      onOpenChange(false);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">{children}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {note && (
          <div className="space-y-1.5">
            <Label htmlFor={noteId}>{note.label}</Label>
            <Textarea
              id={noteId}
              value={text}
              maxLength={500}
              placeholder={note.placeholder}
              onChange={(e) => setText(e.target.value)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">Required, 3–500 characters. Saved in the audit log.</p>
          </div>
        )}
        {error !== null && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage(error)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          {/* Not AlertDialogAction: that closes the dialog before the request finishes. */}
          <Button variant={destructive ? "destructive" : "default"} disabled={pending || !noteOk} onClick={confirm}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
