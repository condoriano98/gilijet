# Versioning — app now, database planned

**Update 2026-10-30:** the Build card exists on `/admin/diagnostics` (`getBuildInfo`) and the `admin-diagnostics` e2e passes against the staging database. Tags `v1.0.0`, `v1.1.0`, `v1.1.1`, `v1.2.0`, `v1.3.1`, `v1.4.0`, `v1.10.2` and `v1.10.3` still do not exist; only `v1.3.0` and `v1.5.0` to `v1.10.1` do.
**Status:** Phase 1 implemented, committed (`f918963`) and pushed; phase 2 (migrations) committed (`21d65e5`) and pushed, and the staging build log shows the migration step running correctly. Tags `v1.0.0` / `v1.1.0` / `v1.1.1` not created yet; the Build card and the final READY state on staging not checked yet.
**Created:** 2026-10-14
**Scope:** Phase 1 (app versioning) is done. Phase 2 (database migrations) is implemented for the repo and the staging database (2026-10-14); production is deliberately untouched and only documented.

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
| QC on the dev server | Done (see QC) |
| Commit and push to `staging` (`f918963`) | Done |
| Tags `v1.0.0` (on `88d0781`) and `v1.1.0` (on `f918963`) | Pending — needs the user's go-ahead |

Deviation from the plan: the Build card renders plain rows rather than the
page's `StatusRow`, whose ok/off badge has no meaning for a version or commit.

## Phase 2 — database migrations (implemented for repo + staging)

**Constraint:** the production database is never touched in this task; only the
staging database (`asymnwikxyhipoezoggp`). Production rollout is a runbook in
`docs/RELEASING.md` ("Production database"), not executed.

### What changed from the original design

The first design (written 2026-10-14, before implementation) baselined at the
schema *after* v1.1.0 and ran after that release. It was changed to baseline at
**production's current schema (`origin/main`)**: with a baseline at today's
schema, production would need a manual `db push` first, and the first migrate
build would fail on a non-empty database. Now `0_init` is the `main` schema and
`1_round_trip_and_seasonal_pricing` is everything since, so production's later
rollout is "record `0_init`, merge, the build applies `1_…`".

### Implemented

| Item | Status |
|---|---|
| `prisma/migrations/0_init` (main schema, 1178 lines of SQL, plus RLS on `OperatorPicContact` which Prisma does not model) | Done |
| `prisma/migrations/1_round_trip_and_seasonal_pricing` (75 lines: additive, one `DROP NOT NULL` on `Booking.legId`; Season RLS policy, made safe on a Postgres without the Supabase roles) | Done |
| `prisma/sql/season-rls.sql` removed (now inside `1_…`) | Done |
| `scripts/db-push-if-configured.mjs` → `scripts/db-migrate-if-configured.mjs` (`prisma migrate deploy`; runs only on Vercel production, the `staging` environment and local builds; any other preview skips and touches no database; P3005 gives baseline instructions) | Done |
| `package.json`: build uses the new script; `db:push` removed; `db:status` added | Done |
| CI: new `Migrations` job (`migrate deploy` on an empty Postgres, then a diff against `schema.prisma` must be empty); e2e job uses `migrate deploy`; `staging` added to push branches | Done, not yet seen running on GitHub |
| Unit test `tests/unit/scripts/db-migrate-guard.test.ts` (7 cases) | Done |
| Docs: README "Database"/"Environments", `STRUCTURE.md`, `CLAUDE.md` (DB rule), `docs/RELEASING.md` (production runbook), `.claude/agents/{prisma-migrator,seed-loader}.md`, `.env.example`, schema comments, `scripts/schema-docs.py` | Done |
| Staging DB: `migrate resolve --applied` for both migrations | Done (2026-10-14) |
| Production DB: baseline and first migrate deploy | **Not done, by decision** |

Design rules kept from the first version: forward-only; rollback is a new
migration; destructive changes in steps; `migrate dev` runs against a local
Docker Postgres, never Supabase (it needs a shadow database).

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

1. With the user's confirmation: tag `v1.0.0` on `88d0781` (retroactive),
   `v1.1.0` on `f918963` and `v1.1.1` on `ed5393c`, then push the tags.
2. Once the staging deploy is up, open staging.gilifast.com
   `/admin/diagnostics` and confirm version, commit and branch; record it here.
3. Phase 2 follow-ups: confirm the GitHub `Migrations` job passed and the
   staging deployment is READY (the staging build log already shows
   `[db-migrate] OK`, see QC). Baseline production only when the owner decides
   (`docs/RELEASING.md`, "Production database").

### QC, phase 2 (2026-10-14)

Scratch database: a throwaway `postgres:16-alpine` container (removed afterwards).
Staging database: `asymnwikxyhipoezoggp` only. Payment and messaging keys blanked.

| Check | Result |
|---|---|
| `migrate deploy` on an empty Postgres | First attempt **failed**: `role "anon" does not exist` (the Season RLS policy named Supabase roles). Fixed in `1_…` by creating the policy for whichever of `anon`/`authenticated` exist, else `public`; second attempt applied both migrations |
| Drift, empty scratch DB after `migrate deploy` vs `schema.prisma` | Empty |
| RLS on scratch | `OperatorPicContact` and `Season` enabled, policy present: same as staging |
| `seed:qa` and the full Playwright suite against the migrated scratch DB | Seed ok. First run 1 failure (see below); after the fix 24 passed, 4 skipped at 2 and at 4 workers (the 4 skips were restored on 2026-10-14, see TESTING_PLAN) |
| Build script, 5 cases | Up-to-date DB → "No pending migrations"; non-Supabase host refused; Vercel preview with a bogus URL → skipped, exit 0; production with no URL → fails; DB with tables and no history → P3005 with instructions, and the tables were unchanged |
| Staging before: drift vs `schema.prisma`, `_prisma_migrations` | Empty / absent; 41 tables |
| Staging `migrate resolve --applied 0_init` and `1_…` | Both marked applied |
| Staging after | `migrate status` up to date; drift empty; 42 tables (only `_prisma_migrations` added); both rows finished with 0 applied steps; data intact (8 seasons, 25 bookings); the build script reports "No pending migrations" |
| `pnpm typecheck`, `pnpm lint`, `pnpm vitest run` (clean shell) | Clean, 0 errors, 888/888 |
| Playwright full suite against staging, 2 workers | 24 passed, 4 skipped (existing), 0 failed; no fixture left |

**Test isolation bug found by this QC:** the season specs shared dates in 2099
and the season calendar is global, so specs running in parallel could close each
other's days (the reschedule spec's OFF day on 15 Jun 2099 hid the PEAK day of
the booking spec). It passed on staging earlier only by timing. Each season spec
now owns a year (2099, 2097, 2096, 2095).

Verified after the push (2026-10-14, staging deployment `dpl_HWjmBBZYNG9fNckwvjWUWQxk1ivc`,
commit `21d65e5`, read from the Vercel build log): the build ran
`gilifast@1.1.1 build` → `prisma generate && node scripts/db-migrate-if-configured.mjs && next build`;
the script logged `[db-migrate] Vercel target "staging"` (so `VERCEL_TARGET_ENV`
works as assumed), `2 migrations found`, `No pending migrations to apply.` and
`[db-migrate] OK — database is up to date`; `next build` then ran and the build
reported `Build Completed in /vercel/output [27s]`.

Not verified: anything on production; the final READY state of that deployment
(it still showed BUILDING while outputs were being deployed when last read); the
GitHub `Migrations` job (the GitHub API was not reachable from here); the "skip
other previews" behaviour in a real preview build (covered by the unit test and
by running the script with a faked Vercel environment); the staging site itself
after the deploy.

## Findings outside this task

- `DATABASE_URL` and `DIRECT_URL` are scoped to Preview and Production on the
  `gilifast` Vercel project (names only; values not read), although the README
  says never to scope them to Preview. The new build script refuses to migrate
  anything but production and `staging`, which removes the mutation risk, but
  the owner should still re-scope them.
- `docker/entrypoint.sh`, which the old script and `SKIP_DB_PUSH` referred to,
  does not exist in the repo; Docker/droplet statements in older docs may be stale.
- The `Season` RLS policy targets `anon`/`authenticated`, but no table grants to
  those roles are visible, so it likely has no effect through PostgREST until
  grants exist. Not investigated further.
- Environments (checked 2026-10-14, variable names only): the Vercel account
  connected here has one Gilifast project, `gilifast`, and no `gilifast-staging`.
  It carries a custom environment with the staging `DATABASE_URL`,
  `AUTH_SECRET`, `QR_HMAC_SECRET` and Google OAuth values, so staging looks like
  a custom environment of `gilifast`, not a second project as the README says.
  Check and correct the README "Environments" section.
- `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `WATI_*` are not in
  that project's variable list. Details and impact: `BUGS_ROUND_TRIP.md`
  follow-up 6. Fixes shipped after v1.1.0 are in `CHANGELOG.md` 1.1.1.

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
