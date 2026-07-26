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
 * Strategy: on every Vercel build, if DIRECT_URL (or DATABASE_URL) is
 * configured, run `prisma db push --skip-generate`. This is idempotent:
 * if schema already matches, it does nothing. If schema is behind, it
 * applies forward-only column additions. It does NOT use
 * --accept-data-loss, so destructive changes fail the build loudly.
 *
 * A failed push fails the build. This script used to exit 0 instead, on
 * the theory that a broken push shouldn't take the site down — but the
 * opposite happened: a silently-skipped push shipped code referencing a
 * missing LoginAttempt table, and every login page 500'd on a green
 * build. Drift must not be deployable.
 *
 * If neither URL is set (e.g. local CI without DB), skip silently.
 *
 * Set SKIP_DB_PUSH=1 to opt out where a build-time push is wrong: the
 * Docker image builds against a placeholder DATABASE_URL and pushes for
 * real from docker/entrypoint.sh once the container can reach Postgres.
 */
import { spawnSync } from "node:child_process";

if (process.env.SKIP_DB_PUSH === "1") {
  console.log("[db-push] SKIP_DB_PUSH=1 — skipping (push happens at container start)");
  process.exit(0);
}

const haveDb = Boolean(process.env.DIRECT_URL || process.env.DATABASE_URL);
if (!haveDb) {
  console.log("[db-push] DIRECT_URL/DATABASE_URL not set — skipping prisma db push");
  process.exit(0);
}

console.log("[db-push] Running prisma db push (no --accept-data-loss)");
const res = spawnSync("pnpm", ["prisma", "db", "push", "--skip-generate"], {
  stdio: "inherit",
  env: process.env,
});

if (res.status !== 0) {
  console.error("[db-push] FAILED — see error above. Failing the build.");
  console.error("[db-push]");
  console.error("[db-push] Deploying past this ships code whose queries reference");
  console.error("[db-push] tables/columns the database does not have. Prisma then");
  console.error("[db-push] throws P2021/P2022 at runtime on the first request that");
  console.error("[db-push] touches them — a silent outage discovered by users, not");
  console.error("[db-push] by CI. A blocked deploy is visible and fixable in minutes.");
  console.error("[db-push]");
  console.error("[db-push] Common cause: DIRECT_URL unset/wrong, so DDL is attempted");
  console.error("[db-push] through the pgBouncer pooler (:6543). It needs the direct");
  console.error("[db-push] connection (:5432).");
  process.exit(1);
}
console.log("[db-push] OK — schema in sync");
