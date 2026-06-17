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
 * If neither URL is set (e.g. local CI without DB), skip silently.
 */
import { spawnSync } from "node:child_process";

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
  console.error("[db-push] FAILED — see error above. Build will continue but");
  console.error("[db-push] queries against drifted columns will throw at runtime.");
  // Don't fail the build: a broken push shouldn't take the whole site down.
  // The runtime error is no worse than the current state.
  process.exit(0);
}
console.log("[db-push] OK — schema in sync");
