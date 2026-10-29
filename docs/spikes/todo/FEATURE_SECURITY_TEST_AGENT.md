# Feature: AI agent for security testing (staging only)

**Status (2026-10-30):** planned, not started. Waiting for "implement". Nothing in this doc changes app code.
**Created:** 2026-10-30
**Target version:** `[Unreleased]` (agent definition, test plan, docs, one pilot run). Any fix found by the agent is its own task and version.
**Related:** `FEATURE_SECURITY_CHECKS_CI.md` (automated scanners in CI: Dependabot, `pnpm audit`, CodeQL, secret scanning) and `FEATURE_UI_UX_AGENT.md` (same setup pattern). This ticket is the active, scenario-driven testing layer on top of those.

## Background

Gilifast takes real payments (DOKU, PayPal), signs tickets, runs operator and admin back offices, and accepts public webhooks and cron calls. Phase 1 and the marketing measurement work add more public endpoints (`/api/marketing/*`). Today there are two security layers: `.claude/agents/security-auditor.md` reads a **diff** and checks a fixed list, and CI scanners (planned) look at dependencies, code patterns and secrets. Neither tries to *attack the running app* the way a tester would: wrong-tenant access, forged callbacks, tampered prices, replayed tickets. An agent that does this against staging, repeatably, would catch what review and scanners miss.

## Scope of this ticket

Set up the agent and how it works for security testing. Running a full test campaign is not part of this ticket beyond one small pilot.

## What to deliver

1. **Role of the agent:** what it tests, what it must never do.
2. **Tools and model**, and how it reaches the repo and the staging deployment.
3. **Test plan baseline:** the attack surface of this app, as a checklist the agent works from.
4. **Workflow:** from request to findings, human triage, fix, and retest.
5. **Instruction guidelines** so results are consistent and nothing real is harmed (money, customer data, production).
6. **Pilot** on one small area to validate the flow.
7. **Proposal for a recurring schedule** (per release, after Phase 1, before go-live changes).

## 1. Role and limits

**Does**
- Plans and runs black-box and grey-box tests against **staging** (`gilifast` Vercel project, custom environment `staging`, staging Supabase only).
- Reads the code to find where a check should exist, then tries to bypass it on staging.
- Writes a findings report: severity, affected route, exact reproduction, evidence, suggested fix, and the test that would prevent regression.
- Proposes regression tests (unit or Playwright) for each confirmed finding. Writing them is a separate task unless the owner says otherwise.

**Must never (hard limits)**
- Touch production in any way: no `.env.prod`, no production URL other than passive public reading of a page, no production DB, no Vercel/Supabase production tools (CLAUDE.md rule 1).
- Any DoS, flooding, load testing, brute-forcing of real accounts, or mass scanning. Rate-limit behaviour is tested with a handful of requests, never a burst.
- Move real money. Payment tests use the mock gateway or the DOKU 1-rupiah staging path only, with the owner's go-ahead for each paid run.
- Read, copy, or store real customer personal data. Tests use fixtures the agent creates and deletes (same pattern as the e2e specs). If staging holds real data, the agent reports that and stops.
- Run scripts that write data, seeds, or SQL against any database without confirmation (CLAUDE.md rule 4).
- Test third parties (DOKU, PayPal, Meta, Google, WhatsApp, Supabase, Vercel infrastructure). Only Gilifast's own code and configuration are in scope.
- Publish an exploit or working attack recipe outside the findings doc. No weaponised payload collections.
- Commit, push, or merge (rule 5, rule 9).

**Authorization:** the owner confirms in the ticket that testing the staging deployment is permitted. Without that note the agent does not start.

## 2. Tools, model, access

- **Model:** the most capable model for planning and for analysing auth, payment and tenant logic; a cheaper model for repetitive checks (headers, route sweeps). Chosen per task.
- **Tools (agent file):** `Read, Grep, Glob, Bash, WebFetch`, with Bash limited in the instructions to `curl` and Playwright against the staging URL and local `pnpm` test commands. No Edit/Write except the findings doc under `docs/spikes/`.
- **Staging access:** staging URL with the existing Vercel deployment protection bypass; test accounts for customer, operator and admin created on staging for this purpose (credentials kept out of the repo and out of the findings doc).
- **Local alternative:** `pnpm dev` against the staging database for tests that need server logs.
- **Not given:** production credentials, Supabase service key for production, any write tool for Vercel or Supabase.
- **Relationship to `security-auditor`:** that agent stays as the pre-merge diff gate. The new agent (proposed name `security-tester`, file `.claude/agents/security-tester.md`) tests the running app. Both read the same checklist so they do not drift.

## 3. Baseline test plan (attack surface in this repo)

Areas, each with example checks. The agent adds to this list as the app grows.

1. **Authentication and sessions:** cookie flags (HttpOnly, Secure, SameSite), JWT expiry and tampering, separate cookies per role, logout invalidation, login throttle (`login-throttle`) behaviour, password reset or OAuth callback handling (Google sign-in).
2. **Authorization and tenant isolation:** every `operator/*` page and action as another operator (must see nothing; `operatorId: session.sub` scoping), every `admin/*` page as operator and as customer, `requireSuperAdmin` on destructive actions, direct calls to server actions and `/api/operator/*`, `/api/admin/*`.
3. **IDOR on customer data:** booking lookup by reference (`/b/[reference]`, `/api/bookings/[reference]`), guessability of references, tickets, refunds, reviews, account pages for another customer.
4. **Payments and prices:** price is computed on the server from the leg and season (client-sent totals ignored), tampering with passenger counts, categories, promo codes (`/api/promos/validate`), currency and FX, round-trip leg roles, replay of a payment, paying an expired or cancelled booking, double-spend of seats (hold vs confirm race).
5. **Webhooks:** DOKU, PayPal and WhatsApp signature checks (missing, wrong, replayed, old timestamp), idempotency through `WebhookEvent`, amount and currency mismatch, public endpoint size cap and logging of rejected calls.
6. **Cron endpoints:** every `/api/cron/*` rejects missing or wrong `CRON_SECRET`; none can be triggered by a customer; behaviour on repeated calls.
7. **Tickets and QR:** forging or editing a QR payload (`QR_HMAC_SECRET`), replaying a scanned ticket, scanning as a non-operator, tickets issued only after admin confirmation (`ticket-issuer`).
8. **Refunds:** amount derived server-side, only admin approves, operator cannot approve, customer cannot request another customer's refund, "Mark money returned" action authorization.
9. **Input handling:** XSS in names, notes, review text, blog and email content; HTML in emails; SQL/ORM injection attempts on search and filters; file or URL inputs (SSRF through any fetch of a user-supplied URL); open redirects on `redirect()` and callback URLs; path traversal in download or print routes.
10. **Marketing and privacy endpoints:** `/api/marketing/*` accept only allowed event names and payloads, PII guards (`features/marketing/privacy`), consent withdrawal really stops sending, click-id and URL query stripping, SUPER_ADMIN guard on admin marketing APIs.
11. **MCP and machine endpoints:** `/api/mcp` refuses without `MCP_REVIEWER_TOKEN`, read-only really read-only, PII masking when `MCP_REDACT_PII` is set.
12. **Messaging:** operator e-ticket mailbox handling (sender check, `Authentication-Results`, forwarding to the wrong buyer), WhatsApp template injection.
13. **Configuration and headers:** security headers (CSP, HSTS, frame options, referrer policy), CORS, error pages that leak stack traces or env names, `robots`/exposed files, source maps, `/admin/diagnostics` exposure.
14. **Secrets and dependencies:** covered by the CI scanners ticket; the agent only confirms the findings there are triaged.
15. **Infrastructure basics:** RLS on new tables (the marketing migrations enable RLS with no policies), service-key usage only server-side.

Note: `security-auditor` currently marks rate limiting and security headers as out of scope. This agent covers both on staging, so the checklist of that agent needs a one-line pointer to this ticket when implemented.

## 4. Workflow

1. **Request:** area or release to test, plus the owner's authorization note for staging.
2. **Spike/plan:** the agent writes a test plan for that area in `docs/spikes/` (what, how, test accounts and fixtures needed, what it will not do) and waits for "implement".
3. **Prepare:** fixtures created on staging through the same builders as the e2e specs; list of what will be created and deleted shown first.
4. **Test:** execute scenarios, record every attempt (including the ones that were correctly blocked). Stop immediately on any sign of real customer data, production traffic, or an unintended write.
5. **Report:** findings doc with severity (Critical / High / Medium / Low), reproduction, evidence, impact, suggested fix, regression test idea; plus the list of what was *not* tested and why.
6. **Triage (human):** owner/dev decides per finding: fix now, accept with reason, later. Critical and High block the next release to `main`.
7. **Fix:** normal feature-builder flow with its own spike, tests and version bump (rule 8).
8. **Retest:** the agent re-runs the specific scenario on staging and records the result.
9. **Cleanup:** fixtures removed, test accounts disabled, results summarised in `CHANGELOG.md` only if user-visible.

## 5. Instruction guidelines (for `security-tester.md`)

- Read `CLAUDE.md`, `STRUCTURE.md`, `.claude/agents/security-auditor.md` and this doc first.
- Confirm the target URL is the staging deployment before every session; refuse any URL that resolves to the production domain.
- Never print or store secrets, tokens, cookies, or customer data in the report; refer to them by name (for example "staging operator A cookie").
- Report only what was reproduced. Anything inferred from code but not demonstrated is labelled "suspected".
- Every finding has: id, area, severity with reasoning, steps, expected vs actual, evidence, fix, retest result.
- No exploitation beyond proof: demonstrate with the least harmful action (read a fixture, not a real row).
- End with: tested, not tested, blocked and why, findings by severity, verdict `no-blocking-issues` / `must-fix-before-merge`.

## 6. Pilot

**Proposed area:** tenant isolation and IDOR (areas 2 and 3). It is the highest-value check for a multi-operator app, needs only two fixture operators and a few bookings, and moves no money.

Steps: write the agent file and the test plan → create two operators and a customer with bookings on staging → try cross-tenant reads and writes through pages, server actions and APIs → write the findings doc → delete fixtures.

Validate: the agent stayed inside the limits, produced reproducible findings or a clean result with evidence, and cleanup left no data behind.

## 7. Proposed schedule

- Before any change to `src/shared/server/auth.ts`, payments, refunds or webhooks lands on `main`: targeted run of the related areas.
- Before the first release after Phase 1: full baseline run (areas 1-13).
- After that: on every minor release, plus after any security-relevant dependency or infrastructure change.
- Findings feed the regression tests, so each run covers less new ground and more retests.

## Phase 2: defend (planned, only after the pilot)

Phase 1 above is attack only: the agent attacks, humans triage and fix, the agent retests. Phase 2 adds the defending side. It is decided after the pilot shows how many findings there are and how the fix cycle feels.

1. **Defender agent (`security-fixer`, proposed).** Reads a findings doc, proposes the smallest fix for each finding plus a regression test (unit or Playwright), and hands it to the normal feature flow (own spike, version bump, human review, staging). It never merges and never changes a protected flow without a task naming it. The tester then retests the same scenario, so the loop is attack, report, fix, retest with less manual relaying.
2. **Detection test.** After each attack scenario the tester checks whether the attempt is *visible*: in the application logs, `/admin/diagnostics`, the webhook log, or the staff WhatsApp alert. A blocked attack that leaves no trace, or a successful one nobody would notice, is a finding of its own ("we would not know"). If nothing exists to detect with, the finding is that the monitoring is missing, and the proposed fix is a small alert (for example on repeated failed webhook signatures or repeated cross-tenant access attempts).
3. **Not planned:** a live red-team/blue-team exercise with an adaptive attacker and a reacting defender. The app has no WAF or intrusion tooling to exercise, so that would test nothing real yet. Revisit if monitoring is added.

Done when (phase 2): defender agent file written; the pilot findings fixed through it with retests recorded; detection results listed per scenario in the findings doc; a decision recorded on which alerts to add.

## Out of scope

- Penetration testing production, third-party systems, or the Supabase/Vercel platforms.
- Social engineering, physical, or staff phishing tests.
- Load and DoS testing.
- Replacing a professional penetration test. If the business requires a third-party audit (for example for a payment licence or partner), this agent's reports are preparation, not a substitute.
- Fixing the findings (separate tasks).

## Open questions

1. Is staging free of real customer data and real payment credentials? (The agent depends on that.)
2. Who authorizes testing and receives findings? Who triages severity?
3. Are test accounts for customer, operator and admin on staging acceptable, and who creates them?
4. Does a second operator exist on staging, or should the agent create fixtures?
5. Does the client or any partner (DOKU, an operator) require a formal security test or report?
6. Should Critical/High findings block every merge to `main`, or only the release?
7. Is the DOKU 1-rupiah staging path allowed for paid-flow tests, and how often?
8. Model and cost budget for each run.

## Done when

- [ ] `.claude/agents/security-tester.md` written with role, limits, tools, model, target check and report format.
- [ ] Baseline test plan above reviewed with the owner and kept in a doc the agent reads (this doc or `docs/SECURITY_TEST_PLAN.md`).
- [ ] Workflow and triage rules documented; a pointer added to `docs/RELEASING.md` for the pre-release run.
- [ ] Pilot run done on staging; findings doc written; fixtures deleted.
- [ ] Pilot result and lessons recorded here; schedule adjusted.
- [ ] Docs swept (rule 7): `STRUCTURE.md`, `CLAUDE.md` (pointer and the staging-only rule), `README.md`, `.claude/agents/security-auditor.md` (scope split), `FEATURE_SECURITY_CHECKS_CI.md` (cross-link), `CHANGELOG.md` `[Unreleased]`.
- [ ] `pnpm lint` and `pnpm typecheck` pass for any file changed.
- [ ] QC recorded here: what ran, the result, what could not be verified.

## Pilot result

_(empty until implemented)_
