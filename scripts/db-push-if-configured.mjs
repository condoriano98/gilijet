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

/**
 * First env var in `names` that holds a non-empty value, with the name kept
 * so failures can say which one is at fault. Prisma's P1013 reports only that
 * "the scheme is not recognized" — with five candidate variables that is not
 * enough to act on.
 *
 * The value is trimmed: a trailing newline survives a copy-paste into a
 * dashboard field and produces exactly that error, with nothing visible on
 * screen to explain it.
 */
function pick(names) {
  for (const name of names) {
    const raw = process.env[name];
    if (raw && raw.trim()) {
      const value = raw.trim();
      if (value !== raw) {
        console.warn(`[db-push] ${name} had surrounding whitespace — trimmed.`);
      }
      return { name, value };
    }
  }
  return null;
}

/**
 * Describe a URL without ever printing credentials. Cuts at the scheme
 * separator, or 24 characters, whichever comes first — enough to see what went
 * wrong, never enough to leak a password into a build log.
 */
function describe(value) {
  const sep = value.indexOf("://");
  const cut = sep === -1 ? 24 : Math.min(sep + 3, 24);
  return `${JSON.stringify(value.slice(0, cut))}… (${value.length} chars)`;
}

const VALID_SCHEMES = ["postgresql://", "postgres://"];

/**
 * This project's Vercel deployment is Supabase-only — see the "Storage names
 * still say gilijet" note in README.md for why the droplet's own Postgres is
 * a deliberately separate, non-Supabase database. Restricting *this* script
 * to Supabase hosts is safe only because the Docker build short-circuits
 * above at SKIP_DB_PUSH=1 before this file ever resolves a URL; the droplet's
 * own `prisma db push` runs from docker/entrypoint.sh, a wholly separate path
 * this file never touches.
 *
 * Matches both connection styles Supabase issues:
 *   pooler:  aws-0-<region>.pooler.supabase.com   (project id in the username)
 *   direct:  db.<project-ref>.supabase.co
 */
const SUPABASE_HOST = /(^|\.)(pooler\.supabase\.com|supabase\.co)$/;

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Fail with something actionable rather than passing a bad string to Prisma. */
function checkScheme(picked, role) {
  if (!picked) return;
  if (VALID_SCHEMES.some((s) => picked.value.startsWith(s))) return;

  console.error(`[db-push] ${picked.name} is not a usable Postgres URL.`);
  console.error(`[db-push] It is the ${role} connection, and it begins ${describe(picked.value)}`);
  console.error("[db-push] Prisma needs it to start with postgresql:// or postgres://");
  console.error("[db-push]");
  console.error("[db-push] The usual causes, in the order they actually happen:");
  console.error('[db-push]   - Quotes pasted into the value. A dashboard field stores');
  console.error('[db-push]     "postgresql://…" literally, quotes and all.');
  console.error("[db-push]   - The whole psql command copied, not just the URL:");
  console.error("[db-push]     psql 'postgresql://…'  →  keep only the part inside quotes.");
  console.error("[db-push]   - A Supabase API URL (https://<ref>.supabase.co) pasted in by");
  console.error("[db-push]     mistake. That is SUPABASE_URL, not a database connection.");
  console.error("[db-push]   - prisma+postgres:// from Prisma Accelerate. db push needs the");
  console.error("[db-push]     underlying Postgres URL, not the Accelerate proxy.");
  console.error("[db-push]");
  console.error("[db-push] Supabase → Settings → Database → Connection string gives both:");
  console.error("[db-push]   pooled  :6543 → DATABASE_URL");
  console.error("[db-push]   direct  :5432 → DIRECT_URL   (db push needs this one)");
  process.exit(1);
}

/**
 * Refuse a URL that authenticates and even parses as Postgres but does not
 * point at Supabase. On Vercel this project has exactly one legitimate
 * database, so a non-Supabase host here is never a valid second environment
 * — it is a stray var from a since-removed integration (Vercel Postgres,
 * Neon, a personal test DB) that has been silently shadowing the real one.
 * Set ALLOW_NON_SUPABASE_DB=1 for the one legitimate exception: pointing a
 * one-off local build at a non-Supabase Postgres on purpose.
 */
function checkSupabaseOnly(picked, role) {
  if (!picked || process.env.ALLOW_NON_SUPABASE_DB === "1") return;
  const host = hostOf(picked.value);
  if (host && SUPABASE_HOST.test(host)) return;

  console.error(`[db-push] ${picked.name} does not point at Supabase.`);
  console.error(`[db-push] It is the ${role} connection, host: ${JSON.stringify(host ?? "(unparseable)")}`);
  console.error("[db-push]");
  console.error("[db-push] This project's Vercel deployment has exactly one legitimate");
  console.error("[db-push] database — Supabase — so a different host here usually means a");
  console.error("[db-push] var from another, no-longer-used integration (Vercel Postgres,");
  console.error("[db-push] Neon, a personal test DB) is shadowing the real Supabase URL.");
  console.error("[db-push]");
  console.error("[db-push] Fix: in Vercel → Settings → Environment Variables, delete any");
  console.error(`[db-push] ${picked.name} that is not from Supabase, then copy the real one`);
  console.error("[db-push] from Supabase → Settings → Database → Connection string:");
  console.error("[db-push]   pooled  :6543, host *.pooler.supabase.com → DATABASE_URL");
  console.error("[db-push]   direct  :5432, host db.*.supabase.co      → DIRECT_URL");
  console.error("[db-push]");
  console.error("[db-push] Intentionally using a non-Supabase Postgres? Set");
  console.error("[db-push] ALLOW_NON_SUPABASE_DB=1 to skip this check.");
  process.exit(1);
}

// Keep this list in step with resolveDatabaseUrl() in lib/db.ts.
const pooledPick = pick([
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
]);

// DDL needs a direct, non-pooled connection — pgBouncer (:6543) can't run
// it. POSTGRES_URL_NON_POOLING is what the Supabase integration sets for
// that. Falling back to the pooled URL usually fails, but it fails loudly
// with a real error rather than being skipped.
const directPick =
  pick(["DIRECT_URL", "POSTGRES_URL_NON_POOLING"]) ?? pooledPick;

checkScheme(pooledPick, "pooled");
if (directPick !== pooledPick) checkScheme(directPick, "direct");

checkSupabaseOnly(pooledPick, "pooled");
if (directPick !== pooledPick) checkSupabaseOnly(directPick, "direct");

const pooled = pooledPick?.value;
const direct = directPick?.value;

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

console.log(
  `[db-push] Running prisma db push (no --accept-data-loss) — ` +
    `pooled from ${pooledPick?.name ?? "none"}, direct from ${directPick?.name ?? "none"}`,
);
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
