// Next.js calls this once when the Node.js server boots (before serving any
// request). We use it to alias the Vercel-Supabase integration env vars
// so Prisma's `DATABASE_URL` / `DIRECT_URL` lookups resolve.
//
// See lib/env-shim.ts for the same logic at module-import time — this is a
// second layer in case the runtime starts a request before any lib/ file
// has been imported.

export async function register() {
  if (!process.env.DATABASE_URL && process.env.POSTGRES_PRISMA_URL) {
    process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
  }
  if (!process.env.DIRECT_URL && process.env.POSTGRES_URL_NON_POOLING) {
    process.env.DIRECT_URL = process.env.POSTGRES_URL_NON_POOLING;
  }
}
