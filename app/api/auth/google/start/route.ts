import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  buildAuthorizeUrl,
  isGoogleOAuthEnabled,
  signState,
} from "@/lib/google-oauth";

const STATE_COOKIE = "gilijet_google_state";

function safeNext(raw: string | null): string {
  if (!raw) return "/account";
  // Only allow same-origin paths to prevent open-redirect.
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/account";
  return raw;
}

export async function GET(req: Request) {
  if (!isGoogleOAuthEnabled()) {
    return NextResponse.redirect(
      new URL("/account/login?error=google_unavailable", req.url),
    );
  }

  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));

  const nonce = crypto.randomUUID();
  const state = await signState({ nonce, next });

  const jar = await cookies();
  jar.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(buildAuthorizeUrl({ state }));
}
