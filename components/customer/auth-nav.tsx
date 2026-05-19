"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type AuthState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "signed-in"; firstName: string };

/**
 * Client component that fetches auth state via /api/auth/me. Keeps the
 * customer layout fully static — only this island hydrates on the
 * client to swap "Sign in/Sign up" for a personalised button. While
 * loading, renders nothing to avoid layout shift, since the buttons
 * are small.
 */
export function AuthNav() {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { signedIn: false }))
      .then((data: { signedIn?: boolean; firstName?: string }) => {
        if (cancelled) return;
        if (data.signedIn && data.firstName) {
          setState({ status: "signed-in", firstName: data.firstName });
        } else {
          setState({ status: "guest" });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "guest" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    // Avoid CLS — reserve the same horizontal space as the buttons.
    return <div className="h-8 w-32" aria-hidden />;
  }

  if (state.status === "signed-in") {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/account">{state.firstName}</Link>
      </Button>
    );
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm">
        <Link href="/account/login">Sign in</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/account/register">Sign up</Link>
      </Button>
    </>
  );
}
