"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, call, onApiEvent, setTokenSource } from "@/api/client";
import { errorMessage, isApiError, isNotAnAdmin } from "@/api/errors";
import type { Permission } from "@/api/permissions.gen";
import type { components } from "@/api/schema.gen";
import { getSupabase } from "@/lib/supabase";
import { clearActivity, markActivity } from "./idle";

export type Me = components["schemas"]["AdminPrincipal"];

/**
 * loading      checking the stored session
 * signed_out   no session
 * mfa_verify   has a verified TOTP factor, session still aal1 → enter code
 * mfa_enroll   role needs 2FA (backend said MFA_REQUIRED) and no factor yet → enroll
 * not_admin    Supabase user, but not an active invited admin
 * error        signed in, but `me` could not be loaded (backend down): retry
 * ready        `me` loaded
 */
export type AuthStatus = "loading" | "signed_out" | "mfa_verify" | "mfa_enroll" | "not_admin" | "error" | "ready";
export type SignOutReason = "user" | "idle" | "expired" | "not_admin";

type AuthContextValue = {
  status: AuthStatus;
  me: Me | null;
  /** Why the last sign-out happened (shown on the sign-in page). */
  signOutReason: SignOutReason | null;
  /** Set when loading `me` failed for a reason other than auth (e.g. backend down). */
  loadError: string | null;
  signIn(email: string, password: string): Promise<void>;
  verifyTotp(code: string): Promise<void>;
  startEnroll(): Promise<{ factorId: string; qrCode: string; secret: string; uri: string }>;
  confirmEnroll(factorId: string, code: string): Promise<void>;
  signOut(reason?: SignOutReason): Promise<void>;
  reload(): Promise<void>;
  can(permission: Permission | null | undefined): boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

/** The signed-in admin; only call below the authenticated layout. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error("useMe called before sign-in completed");
  return me;
}

export function useCan() {
  return useAuth().can;
}

const ISSUER = "UNIMAK Pay";

async function verifiedTotpFactorId(): Promise<string | null> {
  const { data, error } = await getSupabase().auth.mfa.listFactors();
  if (error) throw error;
  return data.totp[0]?.id ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [signOutReason, setSignOutReason] = useState<SignOutReason | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const resolving = useRef<Promise<void> | null>(null);

  const doSignOut = useCallback(
    async (reason: SignOutReason = "user") => {
      setSignOutReason(reason);
      setMe(null);
      setStatus(reason === "not_admin" ? "not_admin" : "signed_out");
      queryClient.clear();
      clearActivity();
      await getSupabase().auth.signOut({ scope: "local" }).catch(() => undefined);
    },
    [queryClient],
  );

  /** Works out where the current session stands and loads `me`. */
  const resolve = useCallback(async () => {
    if (resolving.current) return resolving.current;
    const run = (async () => {
      const sb = getSupabase();
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        setMe(null);
        setStatus("signed_out");
        return;
      }
      const aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.data && aal.data.nextLevel === "aal2" && aal.data.currentLevel !== "aal2") {
        setStatus("mfa_verify");
        return;
      }
      try {
        const principal = await call(api.GET("/v1/admin/me"));
        setMe(principal);
        setLoadError(null);
        setStatus("ready");
      } catch (e) {
        if (isApiError(e) && e.code === "MFA_REQUIRED") {
          setStatus((await verifiedTotpFactorId()) ? "mfa_verify" : "mfa_enroll");
        } else if (isNotAnAdmin(e)) {
          await doSignOut("not_admin");
        } else if (isApiError(e) && e.status === 401) {
          await doSignOut("expired");
        } else {
          // Backend unreachable etc.: keep the session, show the error with a retry.
          setLoadError(errorMessage(e));
          setStatus("error");
        }
      }
    })();
    resolving.current = run;
    try {
      await run;
    } finally {
      resolving.current = null;
    }
  }, [doSignOut]);

  useEffect(() => {
    const sb = getSupabase();
    setTokenSource({
      getToken: async () => (await sb.auth.getSession()).data.session?.access_token ?? null,
      refresh: async () => (await sb.auth.refreshSession()).data.session?.access_token ?? null,
    });
    const offApi = onApiEvent((e) => {
      if (e.type === "mfa_required") void resolve();
      if (e.type === "unauthenticated") void doSignOut("expired");
    });
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setMe(null);
        setStatus((s) => (s === "not_admin" ? s : "signed_out"));
        queryClient.clear();
      }
    });
    void resolve();
    return () => {
      offApi();
      sub.subscription.unsubscribe();
    };
  }, [resolve, doSignOut, queryClient]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === "Invalid login credentials" ? "Wrong email or password" : error.message);
      setSignOutReason(null);
      markActivity();
      await resolve();
    },
    [resolve],
  );

  const verifyTotp = useCallback(
    async (code: string) => {
      const factorId = await verifiedTotpFactorId();
      if (!factorId) {
        setStatus("mfa_enroll");
        return;
      }
      const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw new Error(error.message.includes("Invalid") ? "That code is not right. Try the current one." : error.message);
      markActivity();
      await resolve();
    },
    [resolve],
  );

  const startEnroll = useCallback(async () => {
    const mfa = getSupabase().auth.mfa;
    // Drop half-finished enrollments so a fresh QR code can be issued.
    const list = await mfa.listFactors();
    for (const f of list.data?.all ?? []) {
      if (f.factor_type === "totp" && f.status === "unverified") await mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await mfa.enroll({ factorType: "totp", issuer: ISSUER });
    if (error) throw new Error(error.message);
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
  }, []);

  const confirmEnroll = useCallback(
    async (factorId: string, code: string) => {
      const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw new Error(error.message.includes("Invalid") ? "That code is not right. Try the current one." : error.message);
      markActivity();
      await resolve();
    },
    [resolve],
  );

  const can = useCallback(
    (permission: Permission | null | undefined) => {
      if (permission === null || permission === undefined) return !!me;
      return !!me?.permissions.includes(permission);
    },
    [me],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      me,
      signOutReason,
      loadError,
      signIn,
      verifyTotp,
      startEnroll,
      confirmEnroll,
      signOut: doSignOut,
      reload: resolve,
      can,
    }),
    [status, me, signOutReason, loadError, signIn, verifyTotp, startEnroll, confirmEnroll, doSignOut, resolve, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
