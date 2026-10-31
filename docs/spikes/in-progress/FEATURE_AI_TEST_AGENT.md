# Feature: AI test agent (generate, run and triage end-to-end tests)

**Status (2026-10-31, evening):** the baseline is done and committed to `staging` (see the git log for the commits titled `test:` and `fix:`). Baseline run on a local Postgres: first run 12 failures, none an app regression (environment, wrong specs, app findings); after the fixes **232 passed, 0 failed, 6 skipped**. Reports: `docs/qa-runs/2026-10-31-baseline.md` and `2026-10-31-after-b1-b2-b9.md`. Delivered (also): the `mobile-flow` Playwright project and `mobile-sweep.spec.ts`; bug B12 found by them. Delivered: `test-generator` and `test-triager` agents, `docs/QA_MATRIX.md` (247 cases), 14 new spec files and 2 helpers, `docs/qa-runs/` with the local-run recipe. Bugs found are in `in-progress/BUGS_QA_BASELINE_FINDINGS.md` (B1, B2, B9 fixed, B8 ruled out). **Still open:** the owner's review of the new specs (they were committed on the owner's instruction, not yet read in full); three consecutive full runs to measure stability (two clean ones so far); layout specs at 375 px for the signed-in account pages and the redesigned pages (the booking flow, lookup and 15 data-free pages are done: `docs/qa-runs/2026-10-31-mobile.md`); `seed:qa` (or the specs) creating ports and current legs; specs for the 55 operator/admin gaps; a staging pass if wanted (rule 4). Not run: staging, production, real payment or messaging.
**Bugs found by the baseline run:** `docs/spikes/in-progress/BUGS_QA_BASELINE_FINDINGS.md` (B1 to B11).
**Created:** 2026-10-30
**Target version:** `[Unreleased]` (agent files, QA matrix, generated specs; no user-visible change).
**Why now:** the customer-site redesign (`in-progress/FEATURE_UI_UX_AGENT.md`) restyles every page on `staging`. The owner wants proof that the old behaviour still works. This ticket gives a **baseline before** the redesign and a **re-run after each stage**. The owner said it must be in place before the redesign continues.

## What it is, and what it is not

- It is **end-to-end and browser testing** (Playwright driving a real browser against the running app), not unit testing. Unit tests (`pnpm test:unit`, vitest) check single functions and stay as they are.
- An AI agent **writes and repairs** the Playwright specs. Playwright **runs** them: that step has no AI in it, so results are the same on every run and cost no tokens.
- Specs it produces are normal files under `tests/e2e/`, so they also run in CI and in `pnpm test:e2e` with nobody present.
- It does not replace the existing 20 specs or the unit tests. It fills the gaps (auth, account, refunds, legal, the redesigned layouts) and adds mobile viewports.

## What exists today (checked 2026-10-30)

- Playwright is installed (`pnpm test:e2e`); 20 specs under `tests/e2e/`: customer-booking, round-trip-booking, seasonal-booking, seasonal-pricing, reschedule-season, mobile-layout, tab-branding, marketing-consent, blog-checkin-guide, doku-one-rupiah (opt-in), eticket-*, admin-*, operator-manifest, whatsapp-webhook.
- Pages with **no** e2e spec found: login, register, forgot/reset password, account, refunds, change-plans, reviews/new, about, contact, best-price-guarantee, terms, privacy, booking lookup (`b`).
- `.claude/agents/persona-tester.md` drives the app with `curl` only (no browser); `seed-loader.md` resets QA data; `e2e-flow-runner.md` runs the suite.
- Rule 2 (CLAUDE.md): e2e specs build and delete their own fixtures, and booking specs call `requireMockPayments()` and skip when live gateway keys are set.

## How it works (the pipeline)

| Step | What happens | Who |
|---|---|---|
| 1. Map | Read the route list, the "Redesign tracker" contract, spike docs and the code of a page; write or update its cases in `docs/QA_MATRIX.md` (id, persona, steps, expected result, viewport, needs-human flag). | `test-generator` agent |
| 2. Generate | Write Playwright specs for the cases not yet covered. Fixtures are created and removed by the spec. Selectors prefer roles, labels and `data-testid`, never CSS classes. | `test-generator` agent |
| 3. Review | A human (the owner, or the owner's delegate) reads the new specs before they are committed. Nothing is committed on the agent's own word (rule 5). | human |
| 4. Run | `pnpm test:e2e` at 375, 768 and 1280 px against a **local** dev server with `seed:qa`. Optional last pass against staging, see "Targets". | Playwright |
| 5. Triage | Each failure is classified: **app bug**, **spec wrong or outdated** (markup moved), or **flaky** (passes on retry). Spec fixes are proposed as a diff; app bugs are reported, never fixed by this agent. | `test-triager` agent |
| 6. Report | Written to `docs/qa-runs/<date>-<scope>.md`: pass, fail, skipped, needs-human, plus screenshots and the pages still not covered. | `test-triager` agent |

## When it runs (day-to-day use)

1. **Before a ticket is built:** if the page or flow has cases in the matrix, run them first. That is the baseline. Missing cases are generated first.
2. **After the change:** re-run the same cases. A case that was green and is now red is a regression and blocks the "Tested" box (T) of the page in the tracker.
3. **On every feature or fix** (rule 2 already asks for an e2e spec): the agent proposes the new spec and the owner reviews it. It does not run "by itself" in the background. It runs when a task is finished, when asked, and in CI for the committed specs.
4. **For the redesign:** one run per stage, with the stage's pages plus the payment, booking and ticket flows as a regression pack.
5. **A human pass remains** for what cannot be automated: how the page looks and feels, a real payment, a real WhatsApp or email.

## Targets and data safety

- **Default target: local** (`pnpm dev` + `seed:qa` in a local Docker Postgres). No staging write needed.
- **Staging** (Vercel `staging`, its own database): only for a final, limited pass, and only after the owner confirms and the project ref is named (rule 4). Specs create and delete their own fixtures; none depends on data that can age out.
- **Production: never.** No `.env.prod`, no production URL (rule 1).
- Gateway and messaging keys are blanked for the run; a spec skips if a live key is set.

## Limits (stated up front)

- Real payments (DOKU, QRIS, PayPal), real WhatsApp delivery and real email delivery cannot be tested automatically. The mock path and the call into the sender are tested; delivery stays a human check. These cases are marked `needs-human` in the matrix.
- Generated specs can be shallow or brittle. That is why step 3 exists and why selectors avoid classes.
- During the redesign selectors move. The triager separates "markup changed" from "behaviour broke", but it can be wrong, and a human decides on anything it is unsure about.
- Visual quality (spacing, contrast, "feel") is only partly covered: assertions on overflow, touch-target size and missing labels yes; taste, no.
- Cost: tokens are spent when specs are generated or repaired, not when they run.

## Deliverables

1. `.claude/agents/test-generator.md` and `.claude/agents/test-triager.md` (tools: Read, Edit, Write, Bash, Grep, Glob; strong model for generation, no DB write tools, allow-list `tests/e2e/**`, `docs/**`).
2. `docs/QA_MATRIX.md`: cases per page and per persona, with ids that specs reference in their `test()` titles.
3. New specs under `tests/e2e/` for the uncovered pages, with a mobile project in the Playwright config (375 px) if none exists.
4. `docs/qa-runs/` folder and a run template.
5. A short "How to run QA" section in `README.md` and a pointer in `CLAUDE.md` (workflow rule 2/3), and an update to `persona-tester.md` (what stays manual) and `STRUCTURE.md`.

## Plan

1. **Matrix baseline:** write `QA_MATRIX.md` for the current (old) site: booking, round-trip, payment (mock), booking detail, reschedule, refund, auth, account, content pages.
2. **Generate and review** specs for the gaps, high-risk flows first: booking and payment, then auth and account, then content and legal.
3. **Run the baseline** locally and record the report. Fix test problems; list any real app bugs found (do not fix them here).
4. **Hand over to the redesign:** the redesign tracker gets a "Baseline green" precondition per stage.
5. **After each redesign stage:** re-run, compare with the baseline, update the report.

## Verification of this ticket itself

- A deliberately broken page (a renamed field on a throwaway branch) makes the matching spec fail and the triager label it **app bug**.
- A pure restyle (class names only) keeps the specs green; a moved element gets classified **spec outdated** with a proposed selector diff.
- A spec run twice gives the same result; any test failing once in five runs is marked flaky and quarantined with a reason, not deleted.
- No spec leaves fixtures behind (check row counts before and after on the local DB).

## Out of scope

- Production monitoring and synthetic checks.
- Load, performance and security testing (see `FEATURE_SECURITY_TEST_AGENT.md`).
- Visual regression services (Percy, Chromatic).
- Fixing app bugs the agent finds.

## Open questions

1. Generated specs are committed only after the owner reads them (default in this doc). Should the owner delegate that review to someone else for low-risk pages such as legal?
2. Local database: is a local Docker Postgres available for `seed:qa` on the owner's machine? (CLAUDE.md names one for migrations.)
3. Should CI run the new specs on every PR to `staging`, or only a smoke subset? (Run time grows with 3 viewports.)
4. Is the Playwright mobile project (375 px) acceptable in CI, or manual only?
5. Priority order of flows if time is short: proposed booking + mock payment, booking detail and refund, auth and account, then content pages.

## Done when

- [x] `QA_MATRIX.md` covers every customer route and the operator/admin flows already under test, with `needs-human` marked.
- [ ] Specs exist for every row not marked `needs-human`; reviewed by the owner; committed with approval. (Customer rows: written and committed 2026-10-31, owner review pending; operator/admin rows: not written.)
- [x] Baseline run recorded in `docs/qa-runs/` against the current site; real bugs listed.
- [x] `test-generator` and `test-triager` agent files written and tried once on a real page.
- [x] The redesign tracker references the baseline run per stage.
- [x] Docs swept (rule 7): `README.md`, `STRUCTURE.md`, `CLAUDE.md`, `.claude/agents/persona-tester.md`, `docs/spikes/in-progress/FEATURE_UI_UX_AGENT.md`, `CHANGELOG.md` `[Unreleased]`.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` and `pnpm test:e2e` pass (locally, 2026-10-31).
- [ ] QC recorded here: what ran, the result, what could not be verified.

## QC result

Local run, 2026-10-31: see `docs/qa-runs/`. Checked: unit 1307 passed; e2e 232 passed, 0 failed, 6 skipped; lint and typecheck clean. Not checked: staging, production, real payment and messaging delivery, stability over several runs, browsers other than Chromium, visual quality.
