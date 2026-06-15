// Next.js calls this once when the Node.js server boots (before serving any
// request). We use it to alias the Vercel-Supabase integration env vars
// so Prisma's `DATABASE_URL` / `DIRECT_URL` lookups resolve.
//
// Also auto-seeds the database on first boot when no legs exist, so the
// home page has departures without manual intervention.
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

  // Auto-seed on first boot. Fire-and-forget so it doesn't block the server
  // from accepting requests. The home page also triggers a seed-on-demand
  // fallback in case this doesn't complete before the first visitor arrives.
  autoSeedIfEmpty().catch((err) => {
    console.warn("[instrumentation] auto-seed failed:", err);
  });
}

async function autoSeedIfEmpty() {
  // Dynamic import so we don't pull in Prisma on every Edge/static import.
  // Only the Node.js runtime executes register().
  const [{ prisma }, { seedRealData }] = await Promise.all([
    import("./lib/db").then((m) => ({ prisma: m.prisma })),
    import("./lib/seed-data").then((m) => ({ seedRealData: m.seedRealData })),
  ]);

  try {
    const legCount = await prisma.leg.count();
    if (legCount > 0) {
      console.log(`[instrumentation] DB has ${legCount} legs — skipping seed`);
      return;
    }

    const scheduleCount = await prisma.schedule.count();
    if (scheduleCount === 0) {
      console.log("[instrumentation] DB has no schedules — skipping seed (run prisma db push first)");
      return;
    }

    console.log("[instrumentation] No legs found — starting auto-seed...");
    const start = Date.now();
    const result = await seedRealData();
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(
      `[instrumentation] Auto-seed complete in ${elapsed}s: ` +
      `${result.operators} ops, ${result.schedules} schedules, ` +
      `${result.legsGenerated} legs, ${result.todayLegCount} departing today`
    );
  } catch (err) {
    console.error("[instrumentation] Auto-seed error:", err);
  }
}
