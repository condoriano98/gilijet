"use client";

import { useEffect, useState } from "react";

export type AuthState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "signed-in"; firstName: string };

/**
 * The desktop nav and the mobile sheet both render on every customer page — one
 * of them hidden by CSS — and both need to know who is signed in. Caching the
 * promise at module scope keeps that to a single /api/auth/me request.
 */
let inflight: Promise<AuthState> | null = null;

function load(): Promise<AuthState> {
  inflight ??= fetch("/api/auth/me", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { signedIn: false }))
    .then((data: { signedIn?: boolean; firstName?: string }) =>
      data.signedIn && data.firstName
        ? ({ status: "signed-in", firstName: data.firstName } as const)
        : ({ status: "guest" } as const),
    )
    .catch(() => ({ status: "guest" }) as const);
  return inflight;
}

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    load().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
