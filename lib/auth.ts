import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { env } from "./env";

/**
 * MVP auth: short-lived JWT in an HttpOnly cookie, separate cookies for
 * operator vs admin sessions so a compromise on one side doesn't grant the
 * other. Customers are anonymous (no login).
 */

const OPERATOR_COOKIE = "gilifast_op";
const ADMIN_COOKIE = "gilifast_admin";
const CUSTOMER_COOKIE = "gilifast_cust";
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h (see §9.1)

type Session<Role extends string> = {
  sub: string;
  role: Role;
  email: string;
};

export type OperatorSession = Session<"operator">;
export type AdminSession = Session<"admin"> & {
  adminRole: "SUPER_ADMIN" | "STAFF";
};
export type CustomerSession = Session<"customer"> & {
  fullName: string;
};

function secret(): Uint8Array {
  const s = env.AUTH_SECRET;
  if (!s) {
    throw new Error("AUTH_SECRET is not configured");
  }
  return new TextEncoder().encode(s);
}

async function sign(payload: object): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

async function verify<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as T;
  } catch {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

// ---------- password hashing ----------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ---------- operator session ----------

export async function setOperatorSession(s: OperatorSession): Promise<void> {
  const token = await sign(s);
  const jar = await cookies();
  jar.set(OPERATOR_COOKIE, token, cookieOptions());
}

export async function getOperatorSession(): Promise<OperatorSession | null> {
  const jar = await cookies();
  const token = jar.get(OPERATOR_COOKIE)?.value;
  if (!token) return null;
  return verify<OperatorSession>(token);
}

export async function requireOperator(): Promise<OperatorSession> {
  const s = await getOperatorSession();
  if (!s) redirect("/operator/login");
  return s;
}

export async function clearOperatorSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(OPERATOR_COOKIE);
}

// ---------- admin session ----------

export async function setAdminSession(s: AdminSession): Promise<void> {
  const token = await sign(s);
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, cookieOptions());
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return verify<AdminSession>(token);
}

export async function requireAdmin(): Promise<AdminSession> {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  return s;
}

export async function requireSuperAdmin(): Promise<AdminSession> {
  const s = await requireAdmin();
  if (s.adminRole !== "SUPER_ADMIN") redirect("/admin");
  return s;
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

// ---------- customer session ----------

export async function setCustomerSession(s: CustomerSession): Promise<void> {
  const token = await sign(s);
  const jar = await cookies();
  jar.set(CUSTOMER_COOKIE, token, cookieOptions());
}

export async function getCustomerSession(): Promise<CustomerSession | null> {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  return verify<CustomerSession>(token);
}

export async function requireCustomer(): Promise<CustomerSession> {
  const s = await getCustomerSession();
  if (!s) redirect("/account/login");
  return s;
}

export async function clearCustomerSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(CUSTOMER_COOKIE);
}

// ---------- operator scoping ----------

/**
 * Returns a `{ operatorId }` guard that every operator-facing Prisma query
 * should spread into its `where` clause. Keeps the tenant-scoping rule in
 * one place and is grep-able.
 *
 * Use it like:
 *   where: { ...operatorScope(session), status: "OPEN" }
 */
export function operatorScope(session: OperatorSession) {
  return { operatorId: session.sub } as const;
}
