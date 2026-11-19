"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/auth/auth-provider";
import { safeNext } from "@/auth/safe-next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.email("Enter your work email").max(254),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

const REASONS: Record<string, string> = {
  idle: "You were signed out after 30 minutes without activity.",
  expired: "Your session ended. Sign in again.",
};

export function SignInForm() {
  const { status, signIn, signOutReason } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  useEffect(() => {
    if (status === "ready") router.replace(next);
    else if (status === "mfa_verify" || status === "mfa_enroll") router.replace(`/sign-in/2fa?next=${encodeURIComponent(next)}`);
    else if (status === "not_admin") router.replace("/no-access");
  }, [status, router, next]);

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await signIn(v.email.trim(), v.password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    }
  });

  const busy = form.formState.isSubmitting || status === "loading";
  const reason = signOutReason ? REASONS[signOutReason] : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Finance team access only. Accounts are by invitation.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {reason && (
            <Alert>
              <AlertDescription>{reason}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" autoFocus {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
            {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} aria-invalid={!!form.formState.errors.password} />
            {form.formState.errors.password && <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
