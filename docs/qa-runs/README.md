# QA runs

One file per run, named `<YYYY-MM-DD>-<scope>.md`, written by the `test-triager` agent (`.claude/agents/test-triager.md`). The case list is `docs/QA_MATRIX.md`; the plan is `docs/spikes/in-progress/FEATURE_AI_TEST_AGENT.md`.

A run file has: scope, target and commit, counts (passed, failed, skipped, needs-human, quarantined), each failure with matrix ID and class (app bug, spec outdated, flaky, environment), regressions against the previous run, pages with no coverage, and what was not checked.

## Running the suite locally (how the 2026-10-31 runs were done)

Local only; never against Supabase, staging or production without the owner's go (CLAUDE.md rules 1 and 4).

1. Local Postgres: `docker run -d --name gilifast-qa-pg -p 54329:5432 -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=dev postgres:16-alpine`.
2. Nothing to export. `playwright.config.ts` forces the environment for the runner, the specs and the test server: `DATABASE_URL` and `DIRECT_URL` default to `postgresql://postgres:dev@localhost:54329/dev`, and **the run stops with an error if either one names a non-local host** (so it can never write to Supabase, owner's rule of 2026-10-31); throw-away `AUTH_SECRET`, `QR_HMAC_SECRET`, `CRON_SECRET`; `MARKETING_EVENTS_ENABLED=true`, `NEXT_PUBLIC_GTM_ID=GTM-E2ETEST` (as CI); the three dummy WhatsApp variables below; and every DOKU, PayPal, WhatsApp, SMTP, IMAP, Resend, WATI, Supabase and Google variable blank for the test server (an empty string wins over `.env.local`; an unset variable does not). `E2E_BASE_URL` must be local too, unless `E2E_ALLOW_REMOTE=1` is set with the owner's explicit go. The test server never reuses a server already on port 3000: a plain `pnpm dev` there is the owner's, on the Supabase staging database, so the run fails with "port already used" instead of writing into it. Check `lsof -iTCP:3000 -sTCP:LISTEN -P` before a run.
3. `pnpm db:deploy`, then `pnpm seed:qa`.
4. `seed:qa` makes **no ports** and only **July and August legs**, so add the ports (Sanur, Nusa Penida, Nusa Lembongan, Padang Bai, Gili Air, Gili Trawangan) and legs for the next 30 days to the local database, or the home search and `mobile-layout` have nothing to pick. Open item: have the seed or the specs do this.
5. `pnpm exec playwright test --workers=2`. This runs three projects: `chromium` (desktop), `mobile` (`mobile-layout` on a Pixel 5) and `mobile-flow` (the booking and lookup specs again at 375 px; it starts after `chromium` and is skipped if `chromium` fails, because the two share fixtures).

**Three spec files skip themselves unless a variable is set.** The config now sets harmless local values for them, because they sign their own payloads and WhatsApp stays in mock mode while `WHATSAPP_ACCESS_TOKEN` is empty: `WHATSAPP_WEBHOOK_VERIFY_TOKEN=local-verify-token-0123456789`, `WHATSAPP_APP_SECRET=local-app-secret-0123456789`, `WHATSAPP_TEMPLATE_ORDER_NOTIF=order_masuk_operator` (`whatsapp-webhook.spec.ts`, `eticket-pic.spec.ts`). Never put a real token or secret there. `doku-one-rupiah.spec.ts` stays off locally: it needs `E2E_LIVE_DOKU=1` and a staging URL.

## First-visit blind spot (found and fixed 2026-10-31)

Until 2026-10-31 `playwright.config.ts` gave every spec a saved consent choice, so the consent banner never covered anything and **no spec saw what a first-time visitor sees**. The owner found this when the To field would not open: the fixed banner covered it (bug B14). Now every spec starts with no consent cookie, banner open. Rules:
- A spec that needs a saved choice sets it itself (`tests/e2e/support/consent.ts`, used by `CONT-012`).
- A spec for a redesigned page also checks that the page's main controls receive a tap while the banner is open, at 1280x720 and 375x812 (see `search-form-ports.spec.ts`, `CONT-035`).
- Two servers on one port show two databases (this mixed up the owner's port lists and "no legs" on 2026-10-31: their `pnpm dev` on Supabase staging against my test server on the local database). The config now refuses to reuse a server on port 3000. Check `lsof -iTCP:3000 -sTCP:LISTEN -P` before and after a run, and stop what you started.
