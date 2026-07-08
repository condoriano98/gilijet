import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { setCustomerSession } from "@/lib/auth";
import {
  exchangeCodeForProfile,
  isGoogleOAuthEnabled,
  safeNext,
  verifyState,
} from "@/lib/google-oauth";

const STATE_COOKIE = "gilijet_google_state";

function loginError(req: Request, code: string) {
  return NextResponse.redirect(
    new URL(`/account/login?error=${code}`, req.url),
  );
}

export async function GET(req: Request) {
  if (!isGoogleOAuthEnabled()) {
    return loginError(req, "google_unavailable");
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (url.searchParams.get("error") || !code || !state) {
    return loginError(req, "google_cancelled");
  }

  const jar = await cookies();
  const storedNonce = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  const parsedState = await verifyState(state);
  if (!parsedState || !storedNonce || parsedState.nonce !== storedNonce) {
    return loginError(req, "google_state");
  }

  let profile;
  try {
    profile = await exchangeCodeForProfile(code);
  } catch (err) {
    console.error("[google-oauth] exchange failed", err);
    return loginError(req, "google_exchange");
  }

  // Require Google to have verified the email before we trust the linkage to
  // an existing customer. Without this, anyone could create a Google account
  // with someone else's email and take over their Gilibali account.
  if (!profile.emailVerified) {
    return loginError(req, "google_unverified");
  }

  // Lookup-by-googleId first (fast path for returning users), then fall back
  // to email. Email match auto-links because Google has verified the address.
  let customer = await prisma.customer.findUnique({
    where: { googleId: profile.sub },
  });

  if (!customer) {
    const byEmail = await prisma.customer.findUnique({
      where: { email: profile.email },
    });
    if (byEmail) {
      customer = byEmail.googleId
        ? byEmail
        : await prisma.customer.update({
            where: { id: byEmail.id },
            data: { googleId: profile.sub },
          });
    }
  }

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        email: profile.email,
        googleId: profile.sub,
        fullName: profile.name?.trim() || profile.email.split("@")[0],
      },
    });
  }

  await setCustomerSession({
    sub: customer.id,
    role: "customer",
    email: customer.email,
    fullName: customer.fullName,
  });

  return NextResponse.redirect(new URL(safeNext(parsedState.next), req.url));
}
