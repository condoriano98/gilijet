#!/usr/bin/env node
/**
 * Apply pending Prisma migrations during the build (`prisma migrate deploy`).
 *
 * Schema changes live in `prisma/migrations/`. Each migration is plain SQL that
 * is reviewed in the PR, applied once per database, and recorded in the
 * database's `_prisma_migrations` table. `migrate deploy` is forward-only and
 * never resets or drops anything on its own.
 *
 * Where it runs: Vercel production, the custom `staging` environment, and a
 * local `pnpm build`. Any other Vercel environment (a preview of some other
 * branch) is skipped with a notice and never touches a database — in this
 * project the database variables are scoped to Preview as well as Production,
 * so a preview build would otherwise run a branch's migrations against a real
 * database.
 *
 * A database that already has tables but no `_prisma_migrations` (never
 * baselined) makes `migrate deploy` stop with P3005; this script turns that
 * into instructions. It changes no data.
 *
 * Env-var names: the Vercel–Supabase integration provisions POSTGRES_* rather
 * than DATABASE_URL/DIRECT_URL, and the Prisma CLI only reads the latter, so
 * resolve the same names the runtime does and hand the CLI explicit values.
 * A failed migration fails the build, and so does a production build with no
 * resolvable database: silently skipping is what once let schema drift take
 * production down.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Vercel targets that own a database this project migrates. */
const MIGRATED_TARGETS = ['production', 'staging'];

/**
 * Pure decision: should this build apply migrations?
 * `VERCEL_TARGET_ENV` is `production`, `preview`, `development` or the slug of
 * a custom environment; `VERCEL_ENV` is only production/preview/development.
 */
export function shouldMigrate(env) {
  if (env.VERCEL !== '1') return { run: true, reason: 'not a Vercel build' };
  const target = env.VERCEL_TARGET_ENV || env.VERCEL_ENV || 'unknown';
  if (MIGRATED_TARGETS.includes(target)) return { run: true, reason: `Vercel target "${target}"` };
  return {
    run: false,
    reason: `Vercel target "${target}" is not one of ${MIGRATED_TARGETS.join(', ')}`,
  };
}

/**
 * First env var in `names` that holds a non-empty value, with the name kept so
 * failures can say which one is at fault. The value is trimmed: a trailing
 * newline survives a copy-paste into a dashboard field and produces a scheme
 * error with nothing visible on screen to explain it.
 */
function pick(names) {
  for (const name of names) {
    const raw = process.env[name];
    if (raw && raw.trim()) {
      const value = raw.trim();
      if (value !== raw) console.warn(`[db-migrate] ${name} had surrounding whitespace — trimmed.`);
      return { name, value };
    }
  }
  return null;
}

/** Describe a URL without ever printing credentials. */
function describe(value) {
  const sep = value.indexOf('://');
  const cut = sep === -1 ? 24 : Math.min(sep + 3, 24);
  return `${JSON.stringify(value.slice(0, cut))}… (${value.length} chars)`;
}

const VALID_SCHEMES = ['postgresql://', 'postgres://'];

/**
 * Supabase hosts, both connection styles:
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

function checkScheme(picked, role) {
  if (!picked) return;
  if (VALID_SCHEMES.some((s) => picked.value.startsWith(s))) return;
  console.error(`[db-migrate] ${picked.name} is not a usable Postgres URL.`);
  console.error(`[db-migrate] It is the ${role} connection, and it begins ${describe(picked.value)}`);
  console.error('[db-migrate] Prisma needs it to start with postgresql:// or postgres://');
  console.error('[db-migrate] Usual causes: quotes pasted into the value, a whole psql command');
  console.error('[db-migrate] instead of the URL, a Supabase API URL (https://<ref>.supabase.co),');
  console.error('[db-migrate] or a prisma+postgres:// Accelerate URL (migrations need the direct one).');
  console.error('[db-migrate] Supabase → Settings → Database → Connection string:');
  console.error('[db-migrate]   pooled  :6543 → DATABASE_URL');
  console.error('[db-migrate]   direct  :5432 → DIRECT_URL   (migrations need this one)');
  process.exit(1);
}

/**
 * Refuse a URL that parses as Postgres but is not Supabase. This project has
 * one legitimate database host family, so anything else is a stray variable
 * from a removed integration shadowing the real one. Set ALLOW_NON_SUPABASE_DB=1
 * for the one legitimate exception: a one-off local build against another Postgres.
 */
function checkSupabaseOnly(picked, role) {
  if (!picked || process.env.ALLOW_NON_SUPABASE_DB === '1') return;
  const host = hostOf(picked.value);
  if (host && SUPABASE_HOST.test(host)) return;
  console.error(`[db-migrate] ${picked.name} does not point at Supabase.`);
  console.error(`[db-migrate] It is the ${role} connection, host: ${JSON.stringify(host ?? '(unparseable)')}`);
  console.error('[db-migrate] Delete any non-Supabase variable of that name in Vercel → Settings →');
  console.error('[db-migrate] Environment Variables, or set ALLOW_NON_SUPABASE_DB=1 to skip this check.');
  process.exit(1);
}

function main() {
  const decision = shouldMigrate(process.env);
  if (!decision.run) {
    console.log(`[db-migrate] skipping — ${decision.reason}. No database is touched.`);
    return;
  }
  console.log(`[db-migrate] ${decision.reason}`);

  // Keep this list in step with resolveDatabaseUrl() in src/shared/server/db.ts.
  const pooledPick = pick(['DATABASE_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL']);
  // DDL needs a direct, non-pooled connection: pgBouncer (:6543) cannot run it.
  const directPick = pick(['DIRECT_URL', 'POSTGRES_URL_NON_POOLING']) ?? pooledPick;

  checkScheme(pooledPick, 'pooled');
  if (directPick !== pooledPick) checkScheme(directPick, 'direct');
  checkSupabaseOnly(pooledPick, 'pooled');
  if (directPick !== pooledPick) checkSupabaseOnly(directPick, 'direct');

  const pooled = pooledPick?.value;
  const direct = directPick?.value;

  if (!pooled && !direct) {
    if (process.env.VERCEL_ENV === 'production') {
      console.error('[db-migrate] No database URL resolvable on a production build.');
      console.error('[db-migrate] Looked for: DATABASE_URL, POSTGRES_PRISMA_URL, POSTGRES_URL,');
      console.error('[db-migrate] DIRECT_URL, POSTGRES_URL_NON_POOLING. Skipping here is what let');
      console.error('[db-migrate] schema drift reach production before. Set them for this environment.');
      process.exit(1);
    }
    console.log('[db-migrate] no database URL configured — skipping prisma migrate deploy');
    return;
  }

  console.log(
    `[db-migrate] Running prisma migrate deploy — pooled from ${pooledPick?.name ?? 'none'}, ` +
      `direct from ${directPick?.name ?? 'none'}`,
  );
  const res = spawnSync('pnpm', ['prisma', 'migrate', 'deploy'], {
    // Capture so the failure below can name the cause; both streams are echoed first.
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
    // schema.prisma reads these two names and no others.
    env: { ...process.env, DATABASE_URL: pooled || direct, DIRECT_URL: direct },
  });

  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);

  if (res.status !== 0) {
    console.error('[db-migrate] FAILED — see the error above. Failing the build.');
    console.error('[db-migrate]');
    if (/P3005/.test(output)) {
      console.error('[db-migrate] Cause: this database already has tables but no migration history');
      console.error('[db-migrate] (_prisma_migrations), so it was never baselined. Nothing was changed.');
      console.error('[db-migrate] Record the baseline, then redeploy. See "Production database" in');
      console.error('[db-migrate] docs/RELEASING.md:  prisma migrate resolve --applied 0_init');
    } else if (/P3009|P3018/.test(output)) {
      console.error('[db-migrate] Cause: a migration failed or was left half-applied. Read the SQL error');
      console.error('[db-migrate] above; fix it with a new migration, or `prisma migrate resolve` once the');
      console.error('[db-migrate] database really is in the intended state. Never edit an applied migration.');
    } else {
      console.error('[db-migrate] Common cause: the direct connection is unavailable, so DDL is attempted');
      console.error('[db-migrate] through the pgBouncer pooler (:6543). It needs the direct one (:5432).');
    }
    console.error('[db-migrate]');
    console.error('[db-migrate] Deploying past this would ship code whose queries reference tables or');
    console.error('[db-migrate] columns the database does not have. A blocked deploy is visible and fixable.');
    process.exit(1);
  }
  console.log('[db-migrate] OK — database is up to date');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
