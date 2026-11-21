"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { download } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { OperationId } from "@/api/permissions.gen";
import { GatedButton } from "@/components/permission";

/** "Export CSV": fetches the file through the proxy with the current filters and saves it. */
export function ExportCsvButton({ op, path, query }: { op: OperationId; path: string; query: Record<string, string | undefined> }) {
  const m = useMutation({
    mutationFn: () => download(path, query),
    meta: { inlineError: true },
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Downloaded ${filename}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <GatedButton op={op} variant="outline" size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
      {m.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      Export CSV
    </GatedButton>
  );
}
