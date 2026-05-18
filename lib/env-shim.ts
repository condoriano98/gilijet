// Vercel's "Add Integration → Supabase" provisions env vars under
// POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING. Prisma's schema references
// DATABASE_URL / DIRECT_URL. Alias the integration names so either flavour
// works without any user configuration.
//
// Imported (as a side-effect-only module) at the top of lib/db.ts and
// lib/env.ts so the aliasing happens before anything else reads process.env.

if (!process.env.DATABASE_URL && process.env.POSTGRES_PRISMA_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
}
if (!process.env.DIRECT_URL && process.env.POSTGRES_URL_NON_POOLING) {
  process.env.DIRECT_URL = process.env.POSTGRES_URL_NON_POOLING;
}

export {};
