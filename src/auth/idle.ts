"use client";

import { useEffect } from "react";

export const IDLE_LIMIT_MS = 30 * 60 * 1000;
/** Shared across tabs. Holds only a timestamp, never a token. */
const KEY = "unimak:last-activity";
const WRITE_EVERY_MS = 15_000;
const CHECK_EVERY_MS = 15_000;
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;

export function isIdle(lastActivity: number, now: number, limit = IDLE_LIMIT_MS): boolean {
  return now - lastActivity >= limit;
}

function read(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function write(t: number) {
  try {
    localStorage.setItem(KEY, String(t));
  } catch {
    /* private mode: the in-memory timer still works */
  }
}

/**
 * Call when someone has just authenticated (password, TOTP, email link). A timestamp left
 * over from an earlier session must not count: otherwise a fresh sign-in is "idle" at once
 * and lands straight back on the sign-in page.
 */
export function markActivity(now = Date.now()) {
  write(now);
}

/** Call on sign-out so the next session starts clean. */
export function clearActivity() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Signs out after 30 minutes without activity in any tab (also after a sleeping laptop wakes). */
export function useIdleSignOut(enabled: boolean, onIdle: () => void) {
  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    const stored = read();
    if (stored && isIdle(stored, last)) {
      onIdle();
      return;
    }
    write(last);

    let lastWrite = last;
    const onActivity = () => {
      last = Date.now();
      if (last - lastWrite > WRITE_EVERY_MS) {
        lastWrite = last;
        write(last);
      }
    };
    const check = () => {
      const latest = Math.max(last, read() ?? 0);
      if (isIdle(latest, Date.now())) onIdle();
    };
    for (const e of EVENTS) window.addEventListener(e, onActivity, { passive: true });
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, onActivity);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [enabled, onIdle]);
}
