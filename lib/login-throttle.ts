import { LoginKind } from "@prisma/client";
import { prisma } from "./db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

export type LoginGateResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Per-(kind, email) brute-force gate. Call before the bcrypt compare on
 * every login form. Returns `{ allowed: false }` after MAX_FAILURES failed
 * attempts in the last WINDOW_MS, with a hint at when the window expires.
 *
 * Bcrypt cost-12 already slows an attacker, but bcrypt alone is not enough:
 * a determined attacker with horizontal scale can still chip away. This
 * helper enforces a soft account lock that resets after the window.
 */
export async function loginGate(
  kind: LoginKind,
  email: string,
): Promise<LoginGateResult> {
  const since = new Date(Date.now() - WINDOW_MS);
  const failures = await prisma.loginAttempt.findMany({
    where: { kind, emailKey: emailKey(email), createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: MAX_FAILURES,
  });
  if (failures.length >= MAX_FAILURES) {
    const oldest = failures[0]!.createdAt.getTime();
    const retryAt = oldest + WINDOW_MS;
    const retryAfterSeconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true };
}

/**
 * Record the outcome of a login attempt.
 *  - On failure: insert a row.
 *  - On success: delete all recent rows for (kind, email) so a returning
 *    user with a correct password is not locked out by stale failures.
 */
export async function recordLoginAttempt(
  kind: LoginKind,
  email: string,
  succeeded: boolean,
): Promise<void> {
  const key = emailKey(email);
  if (succeeded) {
    await prisma.loginAttempt.deleteMany({ where: { kind, emailKey: key } });
    return;
  }
  await prisma.loginAttempt.create({ data: { kind, emailKey: key } });
}
