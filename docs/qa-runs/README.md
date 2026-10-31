# QA runs

One file per run, named `<YYYY-MM-DD>-<scope>.md`, written by the `test-triager` agent (`.claude/agents/test-triager.md`). The case list is `docs/QA_MATRIX.md`; the plan is `docs/spikes/in-progress/FEATURE_AI_TEST_AGENT.md`.

A run file has: scope, target and commit, counts (passed, failed, skipped, needs-human, quarantined), each failure with matrix ID and class (app bug, spec outdated, flaky, environment), regressions against the previous run, pages with no coverage, and what was not checked.

## Running the suite locally (how the 2026-10-31 runs were done)

Local only; never against Supabase, staging or production without the owner's go (CLAUDE.md rules 1 and 4).

1. Local Postgres: `docker run -d --name gilifast-qa-pg -p 54329:5432 -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=dev postgres:16-alpine`.
2. In the shell that runs the tests, **override** the env so `.env.local` (which points at Supabase and holds live keys) cannot leak in: `DATABASE_URL` and `DIRECT_URL` = `postgresql://postgres:dev@localhost:54329/dev`; throw-away `AUTH_SECRET`, `QR_HMAC_SECRET`, `CRON_SECRET`; `APP_BASE_URL=http://localhost:3000`; `MARKETING_EVENTS_ENABLED=true`, `NEXT_PUBLIC_GTM_ID=GTM-E2ETEST` (as CI); and every DOKU, PayPal, WhatsApp, SMTP, IMAP, Resend, WATI, Supabase and Google variable set to an empty string. An empty string wins over `.env.local`; an unset variable does not.
3. `pnpm db:deploy`, then `pnpm seed:qa`.
4. `seed:qa` makes **no ports** and only **July and August legs**, so add the ports (Sanur, Nusa Penida, Nusa Lembongan, Padang Bai, Gili Air, Gili Trawangan) and legs for the next 30 days to the local database, or the home search and `mobile-layout` have nothing to pick. Open item: have the seed or the specs do this.
5. `pnpm exec playwright test --workers=2`. This runs three projects: `chromium` (desktop), `mobile` (`mobile-layout` on a Pixel 5) and `mobile-flow` (the booking and lookup specs again at 375 px; it starts after `chromium` and is skipped if `chromium` fails, because the two share fixtures).

**Three spec files skip themselves unless a variable is set.** They open with harmless local values, because they sign their own payloads and WhatsApp stays in mock mode while `WHATSAPP_ACCESS_TOKEN` is empty: `WHATSAPP_WEBHOOK_VERIFY_TOKEN=local-verify-token-0123456789`, `WHATSAPP_APP_SECRET=local-app-secret-0123456789`, `WHATSAPP_TEMPLATE_ORDER_NOTIF=order_masuk_operator` (`whatsapp-webhook.spec.ts`, `eticket-pic.spec.ts`). Never put a real token or secret there. `doku-one-rupiah.spec.ts` stays off locally: it needs `E2E_LIVE_DOKU=1` and a staging URL.
