import "./env-shim";
import { PrismaClient } from "@prisma/client";

/**
 * Resolve the runtime DB URL from any of the env-var names a Vercel +
 * Supabase project might use:
 *
 *   1. DATABASE_URL              — manual setup
 *   2. POSTGRES_PRISMA_URL       — Vercel-Supabase integration (preferred)
 *   3. POSTGRES_URL              — also set by the integration as a fallback
 *
 * We pass the resolved string straight into PrismaClient via
 * `datasourceUrl` so the engine never tries to read process.env itself —
 * eliminating the "Environment variable not found: DATABASE_URL" failure
 * mode entirely.
 */
function resolveDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    undefined
  );
}

const databaseUrl = resolveDatabaseUrl();

if (!databaseUrl && process.env.NODE_ENV === "production") {
  // Loud, single-line warning that surfaces in Vercel logs. Prisma will
  // still throw on first query — this gives us a clearer trail.
  console.error(
    "[db] no DATABASE_URL / POSTGRES_PRISMA_URL / POSTGRES_URL in process.env",
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    ...(databaseUrl ? { datasourceUrl: databaseUrl } : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
