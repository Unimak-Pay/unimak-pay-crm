"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/auth/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setNewPassword, verifyEmailLink } from "./email-link";
import { MIN_PASSWORD, type LinkType } from "./email-link-shared";

const passwordSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD, `At least ${MIN_PASSWORD} characters`).max(72, "At most 72 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match" });
type PasswordValues = z.infer<typeof passwordSchema>;

type Copy = {
  title: string;
  intro: string;
  button: string;
  expired: string;
  expiredLink: { href: string; label: string };
  passwordTitle: string;
};

type Step = "start" | "verifying" | "password" | "continuing" | "expired";

/**
 * Invite / recovery links. Opening the page does nothing but render: Outlook / Office 365 link
 * scanners GET links before people do, so the token is only exchanged when the person presses
 * the button. Then: choose a password → the normal sign-in flow (2FA, /me binds the invite).
 */
export function EmailLinkFlow({ type, copy }: { type: LinkType; copy: Copy }) {
  const tokenHash = useSearchParams().get("token_hash") ?? "";
  const { status, reload } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>(tokenHash ? "start" : "expired");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: { password: "", confirm: "" } });

  // After the password is set, follow the auth state like the sign-in page does.
  useEffect(() => {
    if (step !== "continuing" || status === "loading") return;
    if (status === "mfa_verify" || status === "mfa_enroll") router.replace("/sign-in/2fa?next=%2F");
    else if (status === "not_admin") router.replace("/no-access");
    else if (status === "ready" || status === "error") router.replace("/");
    else if (status === "signed_out") router.replace("/sign-in");
  }, [step, status, router]);

  async function accept() {
    setStep("verifying");
    setError(null);
    const r = await verifyEmailLink(tokenHash, type);
    if (r.ok) setStep("password");
    else if (r.reason === "expired") setStep("expired");
    else {
      setError(r.message);
      setStep("start");
    }
  }

  const onPassword = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await setNewPassword(v.password);
      setStep("continuing");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the password");
    }
  });

  if (step === "expired") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link not valid</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p role="alert">{copy.expired}</p>
          <Button asChild variant="outline" className="w-full">
            <Link href={copy.expiredLink.href}>{copy.expiredLink.label}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "password" || step === "continuing") {
    const e = form.formState.errors;
    const busy = form.formState.isSubmitting || step === "continuing";
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.passwordTitle}</CardTitle>
          <CardDescription>At least {MIN_PASSWORD} characters. A passphrase of a few words is easiest.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onPassword} className="space-y-4" noValidate>
            {/* lets password managers save the new credential */}
            <input type="text" name="username" autoComplete="username" hidden readOnly />
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" autoComplete="new-password" autoFocus {...form.register("password")} aria-invalid={!!e.password} />
              {e.password && <p className="text-xs text-destructive">{e.password.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" {...form.register("confirm")} aria-invalid={!!e.confirm} />
              {e.confirm && <p className="text-xs text-destructive">{e.confirm.message}</p>}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {step === "continuing" ? "Signing you in…" : "Save password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="size-5" aria-hidden /> {copy.title}
        </CardTitle>
        <CardDescription>{copy.intro}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button className="w-full" onClick={() => void accept()} disabled={step === "verifying"}>
          {step === "verifying" && <Loader2 className="animate-spin" aria-hidden />}
          {copy.button}
        </Button>
      </CardContent>
    </Card>
  );
}
