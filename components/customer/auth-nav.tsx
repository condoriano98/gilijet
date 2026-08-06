"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuthState } from "@/components/customer/use-auth-state";

/**
 * Desktop auth buttons. Keeps the customer layout fully static — only this
 * island hydrates on the client to swap "Sign in/Sign up" for a personalised
 * button. Below `sm` these links live in the mobile sheet instead.
 */
export function AuthNav() {
  const state = useAuthState();

  if (state.status === "loading") {
    // Avoid CLS — reserve the same horizontal space as the buttons. Only from
    // `sm` up: on a phone these never render, and reserving 8rem there widened
    // the header past the viewport before hydration had a chance to resolve it.
    return <div className="hidden h-8 w-32 sm:block" aria-hidden />;
  }

  if (state.status === "signed-in") {
    return (
      <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
        <Link href="/account">{state.firstName}</Link>
      </Button>
    );
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
        <Link href="/account/login">Sign in</Link>
      </Button>
      <Button asChild size="sm" className="hidden sm:inline-flex">
        <Link href="/account/register">Sign up</Link>
      </Button>
    </>
  );
}
