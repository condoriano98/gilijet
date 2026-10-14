# Versioning — app now, database planned

**Status:** Implemented and verified locally (2026-10-14). Not committed, pushed or tagged yet — waiting for the user's go-ahead.
**Created:** 2026-10-14
**Scope:** Phase 1 (app versioning) is built in this task. Phase 2 (database
migrations) is designed here and runs as a separate task after v1.1.0 is live.

## Context

Gilifast runs in production at gilifast.com (Vercel `gilifast`, branch `main`)
and in staging at staging.gilifast.com (Vercel `gilifast-staging`, branch
`staging`). Flow: feature branch → `staging` → PR into `main`.

Before this task there was no versioning: `package.json` said `0.1.0`, there
was no changelog, and the only tag was an ad-hoc `prod-search-mode-fix`. "Which
version is production running?" and "what goes out with the next merge?" could
only be answered from `git log`. `staging` is 44 commits ahead of `main`
(round trip, round-trip fixes, the `src/` refactor, the test suite, seasonal
pricing) and will reach production in one merge.

The schema is not versioned either: every Vercel build runs `prisma db push`
(`scripts/db-push-if-configured.mjs`), with no migration history and no
rollback.

## Decisions

- SemVer, one version for the whole app. **Every feature bumps MINOR and every
  bug fix bumps PATCH, in the task's own commit**, with a dated
  `CHANGELOG.md` section. Docs/tests/refactors with no user-visible effect go
  under `[Unreleased]` and ship with the next bump.
- `v1.0.0` = commit `88d0781` on `main`, the version live today (retroactive
  tag). Everything on `staging` now is `v1.1.0`.
- A version is in production once its tag is merged into `main`.
- The running version and commit are shown on `/admin/diagnostics` (super admin
  only).
- The rule lives in `CLAUDE.md` (workflow rule 8). `AGENTS.md` is committed as
  a pointer to `CLAUDE.md` for other coding agents.
- Database migrations: designed below, executed later.

The full process is in [`docs/RELEASING.md`](../RELEASING.md).

## Phase 1 — app versioning (this task)

| Step | Status |
|---|---|
| `package.json` `0.1.0` → `1.1.0` | Done |
| `CHANGELOG.md` (1.1.0 = staging content, 1.0.0 = production baseline) | Done |
| `docs/RELEASING.md` (policy, per-task steps, production release, hotfix, per-version release steps) | Done |
| `src/shared/server/build-info.ts` (`getBuildInfo()`: version, short commit, branch from `VERCEL_GIT_COMMIT_*`) | Done |
| "Build" card on `/admin/diagnostics` | Done |
| Unit: `tests/unit/shared/server/build-info.test.ts`, `tests/unit/changelog.test.ts` | Done |
| E2E: `tests/e2e/admin-diagnostics.spec.ts` | Done |
| `CLAUDE.md` rule 8, `AGENTS.md` pointer (removed from `.gitignore`), `STRUCTURE.md` | Done |
| QC on the dev server | Pending |
| Commit, push, tags `v1.0.0` (on `88d0781`) and `v1.1.0` | Pending — needs the user's go-ahead |

Deviation from the plan: the Build card renders plain rows rather than the
page's `StatusRow`, whose ok/off badge has no meaning for a version or commit.

## Phase 2 — database migrations (designed, not run)

Run as its own task, after v1.1.0 is live in production.

1. **Why after v1.1.0.** A baseline needs staging and production on the same
   schema. Today staging has `Season`, `SeasonType`, `Leg.priceOverridden` and
   `Booking.seasonSnapshot`; production does not.
2. **Check for drift.** For each database:
   `prisma migrate diff --from-url <db> --to-schema-datamodel prisma/schema.prisma --script`
   must print nothing. Fix any drift before the baseline.
3. **Baseline.**
   `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`,
   then `prisma migrate resolve --applied 0_init` on staging, then production.
   Nothing is executed against the data; this only records the migration as
   applied.
4. **RLS.** `prisma/sql/season-rls.sql` becomes migration `1_season_rls` (raw
   SQL in a Prisma migration), so policies are versioned with the schema.
5. **Build.** Replace the `prisma db push` call in
   `scripts/db-push-if-configured.mjs` with `prisma migrate deploy`, keeping the
   Supabase-only guard and `SKIP_DB_PUSH`. CI's e2e job switches to
   `prisma migrate deploy` too.
6. **Development.** `prisma migrate dev` needs a shadow database. Use a local
   Postgres (Docker) for it, never a shadow database on the Supabase staging
   project.
7. **Rollback.** Migrations are forward-only; undo = a new migration that
   reverses the change. Destructive changes go in steps across releases: add →
   backfill → remove.
8. **Versioning link.** A migration is part of the feature or fix that needs
   it, so it ships under that version; `docs/RELEASING.md` "Release steps by
   version" shrinks to steps a migration cannot do (such as seeds).
9. Every step that touches a database needs the user's confirmation and names
   the target project (CLAUDE.md rule 4).

## QC

Run 2026-10-14 on the local dev server (database = staging, read-only: login
and page reads only). WATI, Resend, DOKU and PayPal keys were blanked in the
process because the local env holds production keys; no payment or message
path was exercised.

| Check | Result |
|---|---|
| `pnpm typecheck` (app + `tests/e2e/tsconfig.json`) | Clean |
| `pnpm lint` | 0 errors (1 existing warning in `postcss.config.mjs`) |
| `pnpm vitest run` in a clean shell | 874/874 |
| `changelog.test.ts` catches a version without a changelog section | Confirmed: bumped `package.json` temporarily to a version with no section, 3 tests failed, reverted |
| Build card on `/admin/diagnostics` without `VERCEL_GIT_*` | `v1.1.0`, `local build`, `—` |
| Build card with `VERCEL_GIT_COMMIT_SHA` / `VERCEL_GIT_COMMIT_REF` set | `v1.1.0`, `1181bd6`, `staging` |
| E2E `admin-diagnostics.spec.ts` | 2/2 (version visible to super admin; page not reachable without a session) |
| E2E `seasonal-pricing.spec.ts` and `admin-seasons.spec.ts` (regression) | 9/9 |

Notes and gaps:

- The first E2E run of `admin-diagnostics` failed on a too-broad `Commit`
  locator; the assertion was fixed and re-run green.
- Unit tests must run in a shell that has not sourced `.env.staging`: with it
  loaded, `paypal.test.ts` › "blames the credentials, not the flag" fails. It
  fails the same way on the code without this task's changes, so it is an
  existing sensitivity of that test to a real PayPal env, not caused here.
- Not verified: the deployed site. `VERCEL_GIT_COMMIT_SHA` is only set by
  Vercel builds, so the commit and branch rows on staging.gilifast.com are
  checked after the push. Tags have not been created yet.

## Next steps

1. With the user's confirmation: commit on `staging`, push, tag `v1.0.0` on
   `88d0781` (retroactive) and `v1.1.0` on the new commit, push the tags.
2. After the push, open staging.gilifast.com `/admin/diagnostics` and confirm
   version, commit and branch; record it here.
3. Phase 2 (database migrations) as a separate task after v1.1.0 is in
   production.

## Findings outside this task

- The local `.env.staging` holds production DOKU and PayPal keys
  (`*_IS_PRODUCTION="true"`), while the README says the staging Vercel project
  uses DOKU mock and PayPal sandbox. The local file does not mirror Vercel
  staging; check and separate them.
- `QR_HMAC_SECRET` in the local env is shorter than 32 characters, so
  `/b/<reference>` errors for bookings with tickets in development.
- CI (`.github/workflows/ci.yml`) runs on pushes to `main` and `claude/*` and
  on PRs into `main`, not on pushes to `staging`. The changelog check therefore
  first runs in CI when `staging` is PR'd into `main`. Consider adding `staging`
  to the push branches.
