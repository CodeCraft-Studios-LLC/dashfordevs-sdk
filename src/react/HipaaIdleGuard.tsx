"use client";

/**
 * Automatic sign-out for a HIPAA organization's storefront customers
 * (45 C.F.R. 164.312(a)(2)(iii); John 2026-11-27: "add the timer and inactivity
 * as well for storefronts where hipaa is enabled, sdk should check if hipaa is
 * enabled on org").
 *
 * AuthProvider renders this for you. It asks papi once (client.security()):
 * only when the organization has HIPAA on AND a customer is signed in does it
 * run. After `idleMinutes` without activity a warning counts down
 * `countdownMinutes`; at zero the customer is signed out and the page reloads,
 * so nothing they were looking at stays on screen. One clock per site, shared
 * by every tab through localStorage. While the warning shows, only its buttons
 * count as activity.
 *
 * Plain inline styles, no stylesheet: it must look right on any storefront.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { DashClient } from "../client.js";

const KEY = "dash4devs_last_active";
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"] as const;

function read(): number {
  try {
    return Number(window.localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

function write(ms: number) {
  try {
    window.localStorage.setItem(KEY, String(ms));
  } catch {
    // private mode: this tab's own clock still works below
  }
}

function clock(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface HipaaIdleGuardProps {
  client: DashClient;
  /** Whether a customer is signed in. Nothing runs otherwise. */
  signedIn: boolean;
  onSignOut: () => Promise<void> | void;
  /** Override the organization's setting (tests, previews). */
  force?: { idleMinutes: number; countdownMinutes: number };
}

export function HipaaIdleGuard({ client, signedIn, onSignOut, force }: HipaaIdleGuardProps) {
  const [limits, setLimits] = useState<{ idleMinutes: number; countdownMinutes: number } | null>(force ?? null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const warning = useRef(false);
  const local = useRef(Date.now());
  const lastWrite = useRef(0);
  const leaving = useRef(false);

  useEffect(() => {
    if (force) return;
    let live = true;
    client.security().then((s) => {
      if (live && s.hipaa) setLimits({ idleMinutes: s.idleMinutes, countdownMinutes: s.countdownMinutes });
    });
    return () => {
      live = false;
    };
  }, [client, force]);

  const active = Boolean(limits && signedIn);

  const touch = useCallback((forceWrite = false) => {
    const now = Date.now();
    local.current = now;
    if (!forceWrite && now - lastWrite.current < 15_000) return;
    lastWrite.current = now;
    write(now);
  }, []);

  const signOut = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    try {
      await onSignOut();
    } finally {
      window.location.reload();
    }
  }, [onSignOut]);

  useEffect(() => {
    if (!active) return;
    touch(true);
    const onActivity = () => {
      if (!warning.current) touch();
    };
    for (const name of EVENTS) window.addEventListener(name, onActivity, { passive: true });
    return () => {
      for (const name of EVENTS) window.removeEventListener(name, onActivity);
    };
  }, [active, touch]);

  useEffect(() => {
    if (!active || !limits) return;
    const idleMs = limits.idleMinutes * 60_000;
    const totalMs = idleMs + limits.countdownMinutes * 60_000;
    const tick = () => {
      const last = Math.max(read(), local.current);
      const idle = Date.now() - last;
      if (idle >= totalMs) {
        setRemaining(0);
        void signOut();
      } else if (idle >= idleMs) {
        warning.current = true;
        setRemaining((totalMs - idle) / 1000);
      } else if (warning.current) {
        warning.current = false;
        setRemaining(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [active, limits, signOut]);

  if (!active || remaining === null || !limits) return null;

  const stay = () => {
    warning.current = false;
    setRemaining(null);
    touch(true);
  };
  const fraction = Math.max(0, Math.min(1, remaining / (limits.countdownMinutes * 60)));
  const button: React.CSSProperties = {
    borderRadius: 999, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", border: "1px solid #d4d4d8",
    background: "#fff", color: "#09090b",
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dash4devs-idle-title"
      style={{ position: "fixed", inset: 0, zIndex: 2147483000, display: "grid", placeItems: "center", padding: 16,
               background: "rgba(9,9,11,0.55)", backdropFilter: "blur(6px)", fontFamily: "system-ui, sans-serif" }}
    >
      <div style={{ width: "min(26rem, 100%)", borderRadius: 24, background: "#fff", color: "#09090b", padding: 24,
                    boxShadow: "0 24px 60px -20px rgba(0,0,0,0.45)" }}>
        <h2 id="dash4devs-idle-title" style={{ margin: 0, fontSize: 20, lineHeight: 1.25 }}>Still there?</h2>
        <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, color: "#52525b" }}>
          For your privacy, you'll be signed out when the timer runs out.
        </p>
        <p aria-live="polite" style={{ margin: "16px 0 0", fontSize: 40, fontWeight: 600, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {clock(remaining)}
        </p>
        <div style={{ marginTop: 12, height: 4, borderRadius: 999, background: "#f4f4f5", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${fraction * 100}%`, background: fraction < 0.2 ? "#f43f5e" : "#f59e0b",
                        transition: "width 1s linear" }} />
        </div>
        <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" style={button} onClick={() => void signOut()}>Sign out</button>
          <button type="button" autoFocus style={{ ...button, background: "#09090b", color: "#fff", borderColor: "#09090b" }} onClick={stay}>
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
