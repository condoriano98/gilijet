#!/usr/bin/env node
/**
 * Conditionally run `prisma db push` during build.
 *
 * Why: this project doesn't use Prisma migrations — schema changes go
 * straight from schema.prisma to the DB via `db push`. When schema
 * changes land in git but nobody runs `db push` against production,
 * the Prisma client SELECTs columns that don't exist in PG and every
 * query throws ("column X does not exist"). That's how a working
 * deploy becomes "trouble loading departures" overnight.
 *
 * Strategy: on every Vercel build, resolve a database URL and run
 * `prisma db push --skip-generate`. This is idempotent: if schema
 * already matches, it does nothing. If schema is behind, it applies
 * forward-only column additions. It does NOT use --accept-data-loss,
 * so destructive changes fail the build loudly.
 *
 * Env-var names: the Vercel–Supabase integration provisions POSTGRES_*
 * rather than DATABASE_URL/DIRECT_URL, and lib/db.ts already accepts
 * those names — which is why the app connects at runtime. The Prisma
 * CLI does not: prisma/schema.prisma reads env("DATABASE_URL") and
 * env("DIRECT_URL") literally. That gap is why every production build
 * logged "not set — skipping" and the schema was never pushed, until a
 * login page queried the missing LoginAttempt table and 500'd. So
 * resolve the same set the runtime does and hand the CLI explicit
 * values.
 *
 * A failed push fails the build, and so does a production build with no
 * resolvable database. Silently skipping is what caused the outage.
 *
 * With no database configured off-Vercel (e.g. local CI), skip quietly.
 * Set SKIP_DB_PUSH=1 to opt out where a build-time push is wrong: the
 * Docker image builds against a placeholder DATABASE_URL and pushes for
 * real from docker/entrypoint.sh once the container can reach Postgres.
 */
import { spawnSync } from "node:child_process";

if (process.env.SKIP_DB_PUSH === "1") {
  console.log("[db-push] SKIP_DB_PUSH=1 — skipping (push happens at container start)");
  process.exit(0);
}

// Keep this list in step with resolveDatabaseUrl() in lib/db.ts.
const pooled =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL;

// DDL needs a direct, non-pooled connection — pgBouncer (:6543) can't run
// it. POSTGRES_URL_NON_POOLING is what the Supabase integration sets for
// that. Falling back to the pooled URL usually fails, but it fails loudly
// with a real error rather than being skipped.
const direct =
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  pooled;

if (!pooled && !direct) {
  if (process.env.VERCEL_ENV === "production") {
    console.error("[db-push] No database URL resolvable on a production build.");
    console.error("[db-push] Looked for: DATABASE_URL, POSTGRES_PRISMA_URL,");
    console.error("[db-push] POSTGRES_URL, DIRECT_URL, POSTGRES_URL_NON_POOLING.");
    console.error("[db-push]");
    console.error("[db-push] Skipping the push here is what let schema drift reach");
    console.error("[db-push] production and take every login page down. Set the DB");
    console.error("[db-push] env vars for this environment, or SKIP_DB_PUSH=1 if the");
    console.error("[db-push] push genuinely belongs elsewhere.");
    process.exit(1);
  }
  console.log("[db-push] no database URL configured — skipping prisma db push");
  process.exit(0);
}

console.log("[db-push] Running prisma db push (no --accept-data-loss)");
const res = spawnSync("pnpm", ["prisma", "db", "push", "--skip-generate"], {
  // Capture rather than inherit so the failure below can name the actual
  // cause. Both streams are echoed verbatim first, so nothing is hidden.
  stdio: ["inherit", "pipe", "pipe"],
  encoding: "utf8",
  // schema.prisma reads these two names and no others, so map whatever we
  // resolved onto them rather than relying on them being set already.
  env: { ...process.env, DATABASE_URL: pooled || direct, DIRECT_URL: direct },
});

const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
if (res.stdout) process.stdout.write(res.stdout);
if (res.stderr) process.stderr.write(res.stderr);

if (res.status !== 0) {
  console.error("[db-push] FAILED — see error above. Failing the build.");
  console.error("[db-push]");
  console.error("[db-push] Deploying past this ships code whose queries reference");
  console.error("[db-push] tables/columns the database does not have. Prisma then");
  console.error("[db-push] throws P2021/P2022 at runtime on the first request that");
  console.error("[db-push] touches them — a silent outage discovered by users, not");
  console.error("[db-push] by CI. A blocked deploy is visible and fixable in minutes.");
  console.error("[db-push]");

  // `db push` makes the database match schema.prisma *exactly*, so any table
  // created by hand — a CSV import, a scratch table in the Supabase editor —
  // is something it wants to delete. Naming them beats the generic advice,
  // because the fix is the opposite of what a connection error would need.
  const doomed = [...output.matchAll(/about to drop the `([^`]+)` table/g)].map(
    (m) => m[1],
  );
  if (doomed.length > 0) {
    console.error(
      `[db-push] Cause: ${doomed.length} table(s) exist in the database but not in`,
    );
    console.error("[db-push] prisma/schema.prisma, so the push wants to delete them:");
    for (const t of doomed) console.error(`[db-push]   - ${t}`);
    console.error("[db-push]");
    console.error("[db-push] Do NOT add --accept-data-loss: that deletes them for real,");
    console.error("[db-push] on every future build. Pick one instead:");
    console.error("[db-push]   1. Move them out of the `public` schema — Prisma only");
    console.error("[db-push]      manages `public`, so it stops seeing them:");
    console.error("[db-push]        CREATE SCHEMA IF NOT EXISTS staging;");
    for (const t of doomed) {
      console.error(`[db-push]        ALTER TABLE public."${t}" SET SCHEMA staging;`);
    }
    console.error("[db-push]   2. Adopt them: `prisma db pull` writes accurate models");
    console.error("[db-push]      into schema.prisma, after which they are preserved.");
    console.error("[db-push]   3. Drop them deliberately, once you are sure.");
  } else {
    console.error("[db-push] Common cause: the direct connection is unavailable, so DDL");
    console.error("[db-push] is attempted through the pgBouncer pooler (:6543). It needs");
    console.error("[db-push] the direct connection (:5432).");
  }
  process.exit(1);
}
console.log("[db-push] OK — schema in sync");
