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
Staging is `staging` (`gilifast-staging`, staging.gilifast.com). See the
"Environments" section of the README.

1. Check staging.gilifast.com `/admin/diagnostics`: the version and commit are
   the ones you mean to ship.
2. Read the `CHANGELOG.md` sections between the version on `main` and the one
   on `staging`, and do the release steps any of them calls for (below).
3. PR `staging` → `main`, merge. **The production build runs `prisma db push`
   against the production database** (`scripts/db-push-if-configured.mjs`), so
   any schema change in the range goes live with the merge.
4. Run the post-deploy steps for each version in the range.
5. Check gilifast.com `/admin/diagnostics` shows the new version.
6. Mark the spike docs of the shipped work "deployed vX.Y.Z" and move them to
   `docs/spikes/done/`.

Which versions are live: `git tag --merged origin/main 'v*'`.

### Release steps by version

Steps that are not covered by `db push`. Add a row whenever a version needs one.

| Version | Step | When |
|---|---|---|
| 1.1.0 | `prisma db execute --file prisma/sql/season-rls.sql` (RLS on `Season`) | after the deploy, with the production env |
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
- The database schema is not versioned yet (`prisma db push`, no migrations).
  The plan to move to Prisma migrations is in `docs/spikes/VERSIONING.md`.
