# Feature: automated security checks in CI

**Status (2026-10-24):** planned, not started. **Do after** the e-ticket / PIC task (`FEATURE_ETICKET_PIC_NOTIFICATION.md`) is finished. Waiting for "implement".
**Created:** 2026-10-24
**Target version:** `[Unreleased]` (CI and config only, no user-visible change, no schema change, no app code).

## Why

`.github/workflows/ci.yml` runs typecheck, lint, migrations, unit tests and e2e. Nothing checks dependencies, code patterns or leaked secrets, and there is no Dependabot. The app handles payments (DOKU, PayPal), signed webhooks, auth cookies and customer phone numbers, and secrets have already been pasted into chat during the PIC work (see the Checkpoint in the PIC spike).

## Scope (in order)

1. **Dependabot**: `.github/dependabot.yml`, weekly, ecosystems `npm` (pnpm) and `github-actions`; group minor/patch updates so the PR count stays low.
2. **Dependency audit job**: `pnpm audit --prod --audit-level=high` in `ci.yml`. Decide whether it blocks merges or only warns (start as blocking for `high`/`critical` on production dependencies only).
3. **CodeQL**: `.github/workflows/codeql.yml`, language `javascript-typescript`, on PR to `staging`/`main` and weekly. Needs GitHub code scanning to be available for the repo (free if public, else GitHub Advanced Security); check this first.
4. **Secret scanning**: enable push protection and secret scanning in the GitHub repo settings (no code), or add a `gitleaks` job if the plan does not include it.

## Out of scope

- **SonarCloud / SonarQube**: adds code smells, duplication and coverage dashboards, but little security beyond CodeQL, and needs an account, token and a quality gate to maintain. Revisit only if the team will read the reports.
- Fixing every finding on day one: existing alerts get triaged into this doc (fix now / accept with reason / later), not silenced.

## Open questions

- Is the repo public or private, and does the plan include code scanning and secret scanning?
- Should the audit job block merges, or only report?
- Who receives Dependabot / CodeQL alerts?

## Done when

- [ ] Dependabot opens its first PRs; config merged.
- [ ] `pnpm audit` job runs in CI; first run triaged below.
- [ ] CodeQL runs on a PR; first run triaged below.
- [ ] Secret scanning / push protection confirmed on.
- [ ] Docs swept (rule 7): `README.md` (CI section if any), `docs/RELEASING.md`, `CLAUDE.md` build & test, `CHANGELOG.md` `[Unreleased]`.
- [ ] QC recorded here: what ran, the result, what could not be verified.

## Findings from the first runs

_(empty until implemented)_
