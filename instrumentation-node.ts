// Node.js-only instrumentation. Imported dynamically from instrumentation.ts
// ONLY inside `if (process.env.NEXT_RUNTIME === "nodejs")`, so webpack excludes
// this file and its Prisma dependency from the Edge bundle — which is what
// caused "Can't resolve 'crypto'" and the "Prisma Client on edge runtime" error.
export {}; // ensure this file is treated as a module

// Alias the Vercel–Supabase integration env vars so Prisma's DATABASE_URL /
// DIRECT_URL lookups resolve.
if (!process.env.DATABASE_URL && process.env.POSTGRES_PRISMA_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
}
if (!process.env.DIRECT_URL && process.env.POSTGRES_URL_NON_POOLING) {
  process.env.DIRECT_URL = process.env.POSTGRES_URL_NON_POOLING;
}
