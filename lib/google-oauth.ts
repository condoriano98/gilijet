import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { env } from "./env";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

const STATE_TTL_SECONDS = 60 * 10;

const jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

export function isGoogleOAuthEnabled(): boolean {
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function redirectUri(): string {
  return `${env.APP_BASE_URL}/api/auth/google/callback`;
}

function stateSecret(): Uint8Array {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

type StatePayload = { nonce: string; next: string };

/**
 * Coerces a caller-supplied `next` parameter into a same-origin relative path.
 * Rejects absolute URLs, protocol-relative `//evil.com`, and any value that
 * doesn't start with a single `/`. Used both at OAuth start (to populate the
 * state JWT) and at callback time (defence-in-depth against a forged state).
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function signState(payload: StatePayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(stateSecret());
}

export async function verifyState(token: string): Promise<StatePayload | null> {
  try {
    const { payload } = await jwtVerify(token, stateSecret());
    if (typeof payload.nonce !== "string") return null;
    const rawNext = typeof payload.next === "string" ? payload.next : null;
    return { nonce: payload.nonce, next: safeNext(rawNext) };
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl({ state }: { state: string }): string {
  if (!env.GOOGLE_OAUTH_CLIENT_ID) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured");
  }
  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error("Google OAuth is not configured");
  }
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status}`);
  }

  const json = (await res.json()) as { id_token?: string };
  const idToken = json.id_token;
  if (!idToken) throw new Error("Google response missing id_token");

  // Verify Google's signature + standard claims (iss, aud, exp) against the
  // live JWKS. This is the authoritative check — never trust the JSON body
  // alone.
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.GOOGLE_OAUTH_CLIENT_ID,
  });

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  const emailVerified = payload.email_verified === true;
  const name = typeof payload.name === "string" ? payload.name : null;

  if (!sub || !email) {
    throw new Error("Google id_token missing required claims");
  }

  return { sub, email, emailVerified, name };
}
