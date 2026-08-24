import { PrismaClient } from "@prisma/client";

// Passed straight into PrismaClient via `datasourceUrl` so the engine never
// tries to read process.env itself — eliminating the "Environment variable
// not found: DATABASE_URL" failure mode entirely.
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.NODE_ENV === "production") {
  // Loud, single-line warning that surfaces in Vercel logs. Prisma will
  // still throw on first query — this gives us a clearer trail.
  console.error("[db] no DATABASE_URL in process.env");
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
