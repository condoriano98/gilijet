// Node.js-only instrumentation. Imported dynamically from instrumentation.ts
// ONLY inside `if (process.env.NEXT_RUNTIME === "nodejs")`, so webpack excludes
// this file (and its Prisma + bcryptjs dependencies via lib/seed-data) from the
// Edge bundle — which is what caused "Can't resolve 'crypto'" and the
// "Prisma Client on edge runtime" error.
export {}; // ensure this file is treated as a module

// Alias the Vercel–Supabase integration env vars so Prisma's DATABASE_URL /
// DIRECT_URL lookups resolve. Must run before lib/db is imported below.
if (!process.env.DATABASE_URL && process.env.POSTGRES_PRISMA_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
}
if (!process.env.DIRECT_URL && process.env.POSTGRES_URL_NON_POOLING) {
  process.env.DIRECT_URL = process.env.POSTGRES_URL_NON_POOLING;
}

// Auto-seed on first boot. Fire-and-forget so it doesn't block the server from
// accepting requests. The home page also triggers a seed-on-demand fallback.
autoSeedIfEmpty().catch((err) => {
  console.warn("[instrumentation] auto-seed failed:", err);
});

async function autoSeedIfEmpty() {
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
      console.log(
        "[instrumentation] DB has no schedules — skipping seed (run prisma db push first)",
      );
      return;
    }

    console.log("[instrumentation] No legs found — starting auto-seed...");
    const start = Date.now();
    const result = await seedRealData();
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(
      `[instrumentation] Auto-seed complete in ${elapsed}s: ` +
        `${result.operators} ops, ${result.schedules} schedules, ` +
        `${result.legsGenerated} legs, ${result.todayLegCount} departing today`,
    );
  } catch (err) {
    console.error("[instrumentation] Auto-seed error:", err);
  }
}
