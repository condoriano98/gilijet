# Versioning and releases

One version covers the whole app. It lives in `package.json`, is described in
[`CHANGELOG.md`](../CHANGELOG.md), and is shown with the running commit on
`/admin/diagnostics` (super admin).

## Version numbers

[Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

| Bump | When | Example |
|---|---|---|
| **MAJOR** | Customers, operators or an integration must change how they work: a booking flow replaced, a webhook/API contract changed, a destructive schema change | `1.4.2` → `2.0.0` |
| **MINOR** | A feature: anything new a customer, operator or admin can see or use, including additive schema changes | seasonal pricing: `1.0.0` → `1.1.0` |
| **PATCH** | A bug fix | round-trip check-in fix: `1.1.0` → `1.1.1` |
| none | Docs, tests, refactors, tooling with no user-visible effect | listed under `[Unreleased]`, ships with the next bump |

A task with both a feature and fixes takes the larger bump (MINOR).

## Every feature or bug fix

In the same commit as the change:

1. Bump `version` in `package.json` (MINOR for a feature, PATCH for a fix).
2. Add a dated section to `CHANGELOG.md` directly below `## [Unreleased]`,
   move anything waiting under `[Unreleased]` into it, and group entries under
   `Added` / `Changed` / `Fixed` / `Removed` / `Security`. Write for a reader
   who uses the product, not for a reviewer of the diff.
3. Update the compare links at the bottom of `CHANGELOG.md`:
   `[Unreleased]` compares from the new tag, and the new version compares from
   the previous one.
4. `pnpm test:unit` — `tests/unit/changelog.test.ts` fails if `package.json`
   has a version without a dated section and link.

After the commit (each step needs the user's go-ahead):

5. Annotated tag on that commit: `git tag -a vX.Y.Z -m "vX.Y.Z: <summary>"`.
6. `git push origin staging` and `git push origin vX.Y.Z`.

Work happens on `staging` (or a branch merged into it), so tags are created on
`staging` and reach `main` when it is merged.

## Releasing to production

Production is the `main` branch (Vercel project `gilifast`, gilifast.com).
Staging is the `staging` branch: a custom Vercel environment named `staging` of the `gilifast` project (domain `gilijet.vercel.app`) as of 2026-10-14; the README may still describe a separate `gilifast-staging` project. See the
"Environments" section of the README.

1. Check staging.gilifast.com `/admin/diagnostics`: the version and commit are
   the ones you mean to ship.
2. Read the `CHANGELOG.md` sections between the version on `main` and the one
   on `staging`, and do the release steps any of them calls for (below).
3. PR `staging` → `main`, merge. (A direct push to `main` is not the normal route and needs two separate warnings and confirmations, `CLAUDE.md` rule 9.) **The production build runs `prisma migrate
   deploy` against the production database**
   (`scripts/db-migrate-if-configured.mjs`), so every migration in the range goes
   live with the merge. **Until production has been baselined (see "Production
   database" below) do not merge: the production build would fail with P3005.**
   Read the SQL of the new `prisma/migrations/*` folders in the PR first.
4. Run the post-deploy steps for each version in the range.
5. Check gilifast.com `/admin/diagnostics` shows the new version.
6. Mark the spike docs of the shipped work "deployed vX.Y.Z" and move them to
   `docs/spikes/done/`.

Which versions are live: `git tag --merged origin/main 'v*'`.

### Production database (one-time baseline, not done yet)

Migrations were introduced on 2026-10-14 and recorded as applied on the staging
database only. The production database has **not** been touched: it has the
schema of `main` and no `_prisma_migrations` table. `prisma/migrations/0_init`
is exactly that `main` schema, and `1_round_trip_and_seasonal_pricing` brings it
to the current one (additive SQL, plus one `DROP NOT NULL` on `Booking.legId`).

Do this once, with the owner's go-ahead and the production URL, **before the
first merge of `staging` into `main` that contains `prisma/migrations/`**:

1. Back up the production database (Supabase backup or `pg_dump`).
2. Check production has the schema of `main` (read-only). The diff must print
   nothing:
   `git show origin/main:prisma/schema.prisma > /tmp/main.prisma`, then
   `pnpm prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel /tmp/main.prisma --exit-code`
   Also check `select rowsecurity from pg_tables where tablename = 'OperatorPicContact'`:
   `0_init` enables RLS on it, as on staging. If production differs, fix the
   difference (or `0_init`) before going on.
3. Record the baseline (inserts rows into a new `_prisma_migrations` table, no
   application table is altered):
   `DATABASE_URL="$PROD_DIRECT_URL" DIRECT_URL="$PROD_DIRECT_URL" pnpm prisma migrate resolve --applied 0_init`
4. Merge `staging` into `main`. The production build applies the remaining
   migrations. Check the build log for `[db-migrate] OK`, then
   `pnpm db:status` against production.

Merging before step 3 fails the production build with `P3005` and a message
pointing here; no data is changed, but the deploy is blocked. If a migration
fails half way, the build stops and says so (`P3009`/`P3018`): do not edit it,
read the SQL error, then fix forward with a new migration or `migrate resolve`.
Rollback is forward-only; the last resort is restoring the backup from step 1.

Local setup of a new migration, and why `db push` is no longer used: README
"Database".

### First production deploy after `CRON_SECRET` was added (2026-10-14)

`CRON_SECRET` did not exist before, so `/api/cron/*` always answered 401 and the
three scheduled jobs never ran. It is set now (production and the `staging`
environment, different values), and takes effect with the next production
deployment. From then on Vercel Cron runs, daily:

- `topup-legs` (02:00) generates departures for every active schedule up to the booking horizon;
- `refresh-fx` (00:00) refreshes exchange rates;
- `retry-webhooks` (03:00) retries `PENDING` and `FAILED` DOKU and PayPal payment events. Before 1.3.0 it marked DOKU events done without recording the payment; since 1.3.0 it runs the same handler as the first delivery. Failed events are listed at `/admin/webhooks`.

Before that first deploy, look at the webhook event table for old `FAILED` or
`PENDING` rows: the job will retry them. After it, check the Vercel cron logs
the next morning for 200 responses.

### Release steps by version

Steps that a migration cannot do. Add a row whenever a version needs one.

| Version | Step | When |
|---|---|---|
| 1.1.0 | Schema and the `Season` RLS policy come from migration `1_round_trip_and_seasonal_pricing`; nothing to run by hand | applied by the production build |
| 1.1.0 | `pnpm seed:seasons` (2026/27 season calendar) | after the deploy, with the production env |

Each of these touches the production database: confirm with the user first and
name the target project.

## Hotfix on production

1. Branch `hotfix/<name>` from `main`.
2. Fix, bump PATCH from the version on `main`, add the `CHANGELOG.md` section.
3. PR into `main`, merge, tag `vX.Y.Z` on the merge commit, push the tag.
4. Merge `main` back into `staging`. If `staging` had already used that version
   number, renumber the newer `staging` versions in `CHANGELOG.md` above it.

## History

- `v1.0.0` is retroactive: commit `88d0781` on `main`, the version live when
  versioning was introduced. `package.json` in that commit still says `0.1.0`.
- `prod-search-mode-fix` is an older ad-hoc tag, kept as history. New tags are
  always `vX.Y.Z`.
- The database schema is versioned with Prisma migrations since 2026-10-14
  (`prisma/migrations/`). Design and QC: `docs/spikes/in-progress/VERSIONING.md`.
