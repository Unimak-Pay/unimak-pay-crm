"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { api, call } from "@/api/client";
import { errorMessage, isApiError } from "@/api/errors";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { GatedButton } from "@/components/permission";
import { awaitingFirstSignIn, invitationToast } from "./invitation";

type Invited = components["schemas"]["InvitedAdminUser"];
type User = components["schemas"]["AdminUser"];

function resend(id: string) {
  return call(api.POST("/v1/admin/users/{id}/invite", { params: { path: { id } } }));
}

function refresh(qc: QueryClient, id: string) {
  void qc.invalidateQueries({ queryKey: qk.users });
  void qc.invalidateQueries({ queryKey: qk.user(id) });
  void qc.invalidateQueries({ queryKey: qk.auditRoot });
}

/** Toast for an invitation outcome; failures get a "Re-send invite" action. */
export function showInvitationToast(qc: QueryClient, u: Invited) {
  const t = invitationToast(u);
  const action = t.offerResend
    ? {
        label: "Re-send invite",
        onClick: () => {
          void resend(u.id)
            .then((r) => {
              refresh(qc, u.id);
              showInvitationToast(qc, r);
            })
            .catch((e: unknown) => {
              refresh(qc, u.id);
              toast.error(errorMessage(e));
            });
        },
      }
    : undefined;
  const opts = { action, duration: t.offerResend ? 15_000 : undefined };
  if (t.kind === "success") toast.success(t.message, opts);
  else if (t.kind === "info") toast.info(t.message, opts);
  else toast.warning(t.message, opts);
}

/** Re-send for an active admin who has never signed in. 409 → the user changed: refresh and say why. */
export function ResendInviteButton({ user, size = "xs" }: { user: User; size?: "xs" | "sm" }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => resend(user.id),
    meta: { inlineError: true },
    onSuccess: (r) => {
      refresh(qc, user.id);
      showInvitationToast(qc, r);
    },
    onError: (e) => {
      if (isApiError(e) && e.status === 409) refresh(qc, user.id);
      toast.error(errorMessage(e));
    },
  });
  if (!awaitingFirstSignIn(user)) return null;
  return (
    <GatedButton op="adminResendInvite" size={size} variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
      {m.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
      Re-send invite
    </GatedButton>
  );
}
