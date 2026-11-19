"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-provider";
import { safeNext } from "@/auth/safe-next";
import { CopyValue } from "@/components/format";
import { LoadingBlock } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

function CodeInput({ onSubmit, busy }: { onSubmit(code: string): void; busy: boolean }) {
  const [code, setCode] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6) onSubmit(code);
      }}
    >
      <InputOTP
        maxLength={6}
        value={code}
        onChange={(v) => setCode(v.replace(/\D/g, ""))}
        onComplete={(v: string) => onSubmit(v)}
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="6-digit code"
        disabled={busy}
      >
        <InputOTPGroup>
          {Array.from({ length: 6 }, (_, i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        Verify
      </Button>
    </form>
  );
}

type Enrollment = { factorId: string; qrCode: string; secret: string; uri: string };

export function TwoFactor() {
  const { status, verifyTotp, startEnroll, confirmEnroll, signOut } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  useEffect(() => {
    if (status === "ready") router.replace(next);
    else if (status === "signed_out") router.replace("/sign-in");
    else if (status === "not_admin") router.replace("/no-access");
  }, [status, router, next]);

  useEffect(() => {
    if (status !== "mfa_enroll" || enrollment) return;
    let cancelled = false;
    startEnroll()
      .then((e) => !cancelled && setEnrollment(e))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Could not start 2FA setup"));
    return () => {
      cancelled = true;
    };
  }, [status, enrollment, startEnroll]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <div className="mt-4 text-center">
      <Button variant="link" size="sm" onClick={() => void signOut("user")}>
        Use a different account
      </Button>
    </div>
  );

  if (status === "mfa_verify") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" aria-hidden /> Two-factor authentication
          </CardTitle>
          <CardDescription>Enter the 6-digit code from your authenticator app.</CardDescription>
        </CardHeader>
        <CardContent>
          <CodeInput busy={busy} onSubmit={(c) => void run(() => verifyTotp(c))} />
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {footer}
        </CardContent>
      </Card>
    );
  }

  if (status === "mfa_enroll") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" aria-hidden /> Set up two-factor authentication
          </CardTitle>
          <CardDescription>
            Your role moves money, so 2FA is required. Scan the QR code with an authenticator app (Google Authenticator,
            Microsoft Authenticator, 1Password…), then enter the code it shows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!enrollment && !error && <LoadingBlock rows={3} />}
          {enrollment && (
            <>
              <div className="flex justify-center rounded-md border bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns an SVG data URL */}
                <img src={enrollment.qrCode} alt="QR code for your authenticator app" width={180} height={180} />
              </div>
              <div className="text-xs text-muted-foreground">
                Can&apos;t scan? Enter this secret instead:
                <div className="mt-1 rounded bg-muted px-2 py-1">
                  <CopyValue value={enrollment.secret} className="break-all" />
                </div>
              </div>
              <CodeInput busy={busy} onSubmit={(c) => void run(() => confirmEnroll(enrollment.factorId, c))} />
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {footer}
        </CardContent>
      </Card>
    );
  }

  return <LoadingBlock rows={3} />;
}
