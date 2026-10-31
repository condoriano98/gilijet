# Gilifast

Small-boat ticketing platform for Indonesia — customer booking, an operator
back office, and a platform admin console. Mobile-first, built on Next.js 15 +
Prisma + Postgres. All customer-facing times are **WITA (Asia/Makassar)**.

> **Status:** live MVP. Customers can search, book, pay and check in; operators
> run schedules, departures, POS, cash and reporting; admins onboard operators,
> handle refunds and tune platform economics.
>
> `src/features/diagnostics/feature-catalog.ts` is the canonical inventory of what exists — 58
> entries, each with its routes, owning modules and Prisma models, and a status
> that distinguishes shipped from partial, placeholder and schema-only. Read it
> before assuming a feature works; a few routes exist without being finished.

## Stack

- **Web:** Next.js 15 (App Router, React 19), Tailwind, shadcn-style UI
- **DB:** PostgreSQL (Supabase) via Prisma 6
- **Auth:** JWT in HttpOnly cookies (`jose` + `bcryptjs`), separate cookies per
  audience (customer / operator / admin)
- **Payments:** DOKU Checkout (primary, settles IDR) with PayPal as the backup
  for cards DOKU declines (charged in USD at a stored FX rate)
- **Email:** Gmail SMTP (`nodemailer`, app password: `SMTP_*`, `EMAIL_FROM`), with a console-only mock fallback when they are absent. Also reads the operator's e-ticket mailbox over IMAP (`imapflow`, `INBOX_IMAP_*`; `/api/cron/poll-operator-inbox`, called by hand on staging for now and not scheduled in `vercel.json` (Vercel Cron only fires on production); dry run until `INBOX_POLL_LIVE=true`; `INBOX_POLL_SINCE` limits it to mail from a given day; the admin E-tickets page has a "Check mailbox now" button) and forwards each ticket to the buyer
- **Storage:** Supabase Storage, for operator KYB documents
- **i18n:** `next-intl` — `en`, `id`, `zh`, `ja` on the customer surface

Integrations degrade to mocks rather than crashing when keys are missing, so a
bare clone runs.

## Quickstart

```bash
pnpm install

cp .env.example .env.local     # Next.js reads .env.local in dev
# Required: DATABASE_URL, AUTH_SECRET (16+ chars), QR_HMAC_SECRET (32+ chars)

pnpm db:deploy                 # apply migrations (prisma migrate deploy) — see Database
pnpm seed:qa                   # deterministic QA data with fixed IDs
pnpm dev
```

### Updating an existing checkout

After pulling changes, always run `db:deploy` before seeding — a `git pull` that
adds a folder under `prisma/migrations/` leaves the DB behind the client, which
fails at runtime (e.g. `column Payment.presentmentCurrency does not exist`).

```bash
git pull
pnpm install
pnpm db:deploy                 # apply any migrations that came with the pull
pnpm seed:qa
pnpm dev
```

QA seed logins (from `scripts/seed-qa.ts`, all password `qaqaqaqa`):

| Role | Email | Entry point |
|---|---|---|
| Admin | `qa-admin@gilifast.local` | `/admin/login` |
| Operator | `qa-operator@gilifast.local` | `/operator/login` |
| Customer | `qa-customer@gilifast.local` | `/account/login` (redirects to `/en/…`) |

`pnpm db:seed` instead loads the fuller demo set, defaulting to
`admin@gilifast.local` / `changeme123`.

> **Rotate that password before any deploy.** The seed defaults
> `SEED_ADMIN_PASSWORD` to `changeme123`, so an environment seeded without
> overriding `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` ships with a publicly
> documented super-admin credential.

## Commands

```bash
pnpm dev            # dev server
pnpm qc             # lint + typecheck — the gate before any commit
pnpm test:unit      # vitest, pure functions (tests/unit)
pnpm test:e2e       # Playwright golden paths (tests/e2e)
pnpm seed:qa        # reset to deterministic QA data
pnpm db:studio      # Prisma Studio
```

**End-to-end tests (QA).** The case list is `docs/QA_MATRIX.md`; each run is reported in `docs/qa-runs/`. The `test-generator` and `test-triager` agents (`.claude/agents/`) write the specs and explain the failures; Playwright runs them. They run only against a **local** Docker Postgres with every outbound key blanked (the config enforces it and refuses Supabase): the recipe is in `docs/qa-runs/README.md`. Unit tests (`pnpm test:unit`) are separate and unchanged.

## Database

Schema changes are **Prisma migrations** in `prisma/migrations/`: plain SQL,
reviewed in the PR, applied once per database and recorded in that database's
`_prisma_migrations` table. The build applies pending ones with
`prisma migrate deploy` (`scripts/db-migrate-if-configured.mjs`) on Vercel
production and the `staging` environment; any other preview build skips
migrations and touches no database. `prisma db push` is not used any more: it
bypasses the history.

`0_init` is the schema production had when migrations were introduced (the
`main` schema of 2026-10-14) and `1_…` brings it to the current one, so
`prisma migrate deploy` on an empty database builds the whole schema. Staging
already had everything and has both recorded as applied. **Production has not
been baselined yet: follow "Production database" in `docs/RELEASING.md` before
merging into `main`.**

### Changing the schema

1. Run a local Postgres (`docker run -d -p 54329:5432 -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=dev postgres:16-alpine`)
   and point `DATABASE_URL` and `DIRECT_URL` at it (`postgresql://postgres:dev@localhost:54329/dev`).
   Never run `migrate dev` against Supabase: it needs a shadow database.
2. Edit `prisma/schema.prisma`, then `pnpm db:migrate --name <short_slug>`.
3. Read the generated `migration.sql`. Anything Prisma cannot model (RLS,
   policies) is appended to that same file by hand.
4. Commit the schema and the migration together. CI fails if `schema.prisma`
   and the migrations disagree, or if the migrations do not build on an empty
   database.

Migrations are forward-only: never edit one that has been applied anywhere. To
undo a change, write a new migration. Destructive changes go in steps over
releases (add → backfill → remove). `pnpm db:status` shows what a database has
applied.

The URL is resolved from several env-var names, because the Vercel–Supabase
integration provisions `POSTGRES_*` rather than `DATABASE_URL`:

| Purpose | Names tried, in order |
|---|---|
| Runtime queries (pooled, `:6543`) | `DATABASE_URL` → `POSTGRES_PRISMA_URL` → `POSTGRES_URL` |
| Migrations / DDL (direct, `:5432`) | `DIRECT_URL` → `POSTGRES_URL_NON_POOLING` |

Import `prisma` from `src/shared/server/db.ts`; do not read those env vars anywhere else.
DDL cannot run through the pgBouncer pooler, which is why the direct URL is
separate. A build that cannot resolve a database now fails rather than
silently skipping the push — schema drift used to reach production and take
every login page down with `P2021`.

`scripts/db-migrate-if-configured.mjs` also refuses a resolved URL that is not
a Supabase host (`*.pooler.supabase.com` / `*.supabase.co`). The Vercel
deployment has exactly one legitimate database, so a different host almost
always means a var from a removed integration (Vercel Postgres, Neon, a
personal test DB) is shadowing the real Supabase URL in one of the five
candidate names above — a much more useful diagnosis than the P1013 Prisma
throws once a malformed value reaches it. Set `ALLOW_NON_SUPABASE_DB=1` to
skip the check for the one legitimate exception: pointing a one-off local
`pnpm build` at a non-Supabase Postgres on purpose. This check applies only
to this script — `src/shared/server/db.ts` stays provider-agnostic.

Soft deletes: `Operator`, `Boat` and `Schedule` carry `deletedAt`, so list
queries must filter `deletedAt: null`.

### Database reference PDF

`docs/database.pdf` documents all 38 tables and 41 enums — columns, types,
constraints, foreign keys with their `onDelete` behaviour, and indexes. It is
**generated from `prisma/schema.prisma`**, carrying the schema's own comments
through, so it cannot drift:

```bash
pnpm docs:db          # regenerate after any schema change
```

Requires `reportlab` (`pip install reportlab`). Regenerate and commit it with
any PR that changes the schema; hand-editing the PDF guarantees it disagrees
with the database on the next push.

### Legacy `GILIJET` sales channel

`SalesChannel.GILIJET` is retained in `prisma/schema.prisma` because existing `Booking` rows reference it, and dropping an in-use enum
value makes the migration fail. `src/features/schedules/sales-channel.ts`
folds it onto `GILIFAST` for every display and grouping.

## Environments

Two Vercel projects on the same repo, each with its own Supabase database:

| | Production | Staging |
|---|---|---|
| Vercel project | `gilifast` | `gilifast-staging` |
| Production Branch | `main` | `staging` |
| Domain | gilifast.com | staging.gilifast.com |
| DOKU | live keys, `DOKU_IS_PRODUCTION=true` | unset → mock checkout (2026-10-14: the DOKU keys in Vercel are scoped Production+Preview, not the `staging` environment; update 2026-10-30: the owner reports the Rp 1 live test on staging is finished, so this may be outdated; the staging database has `dokuMode = LIVE` but that only matters once keys exist, see `docs/spikes/done/DOKU_ONE_RUPIAH_STAGING.md`) |
| PayPal | live keys, `PAYPAL_IS_PRODUCTION=true` | sandbox keys, `=false` |

Flow is feature branch → `staging` → `main`. Each project carries an Ignored
Build Step so it only builds its own branch:

```bash
if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 1; else exit 0; fi
```

Exit 1 builds, exit 0 skips — inverted from the intuition.

Without it both projects build on every push to either branch, and the
dangerous half is subtle: a push to `staging` would create a *preview* on the
production project, and if that project's database variables are scoped to
Preview as well as Production, its build would run that branch's migrations
against the **production database**. Never scope `DATABASE_URL` / `DIRECT_URL`
to Preview on `gilifast`. (As of 2026-10-14 they are scoped to Preview as well
as Production there. The build script now refuses to migrate anything except
Vercel production and the `staging` environment, but re-scope them anyway.)

> **Check against reality (2026-10-14):** the Vercel account this repo is wired
> to shows a single project, `gilifast`, with a custom environment `staging`
> (branch `staging`, domain `gilijet.vercel.app`) rather than a separate
> `gilifast-staging` project. The table above predates that; confirm in the
> Vercel dashboard and correct it.

**Staging is a separate project rather than a preview branch** for two reasons.
Vercel Cron only fires on Production deployments, so the three routes in
`vercel.json` would never run on a preview. And `db-migrate-if-configured.mjs`
only hard-fails a build with no resolvable database URL when
`VERCEL_ENV === "production"` — anywhere else it silently skips the migration
and deploys anyway. A separate project gets both behaviours.

The flip side: `VERCEL_ENV` is `"production"` on **both** projects, so it can
never distinguish them. `APP_BASE_URL` is the only reliable signal, which is
what `src/app/robots.ts` keys on to keep staging out of Google.

### Secrets that must differ

| Var | Why |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | migrations run on every production and staging build |
| `AUTH_SECRET` | shared ⇒ a staging session cookie authenticates against production |
| `QR_HMAC_SECRET` | shared ⇒ a staging boarding pass validates at a real dock. Never rotate the production value — it invalidates every ticket already issued |
| `CRON_SECRET` | separate blast radius; also what Vercel Cron sends as its bearer token. It must **exist** on staging — Vercel only injects the bearer when the var is present, and the routes fail closed, so a missing value means all three crons 401 forever and the log still looks fine |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | shared ⇒ staging reads production's KYB documents. See below |
| `APP_BASE_URL` | no fallback to `VERCEL_URL`; unset it becomes `http://localhost:3000` and that string lands in PayPal return URLs and every booking link in email and WhatsApp |

`AUTH_SECRET` deserves the sharp version: `requireAdmin()` in `src/shared/server/auth.ts`
reads `adminRole` straight off the JWT and never re-checks the database. Shared,
you log into staging as the `qa-admin@gilifast.local` / `qaqaqaqa` account that
`pnpm seed:qa` creates unconditionally as `SUPER_ADMIN`, paste the
`gilifast_admin` cookie at gilifast.com, and you are a production super-admin
without ever holding a production credential.

`QR_HMAC_SECRET` is not really about forgery — check-in looks the ticket up in
the database, so a staging pass cannot board a real boat either way. It is about
which message the crew sees. Shared, a staging pass scanned at a real dock
returns *"Ticket not found in the system"*, which reads as a system fault, and
the human response to a system fault at 07:55 is to wave the passenger through.
Different, it returns *"QR code is not a valid Gilifast ticket"* — unambiguous.

### Staging needs its own storage bucket

`src/app/api/operator/document-upload/route.ts` and `src/features/operators/documents.ts`
both build a Supabase client from `SUPABASE_URL` + `SUPABASE_ANON_KEY` against a
hardcoded bucket named `operator-documents`. If staging inherits production's
pair, the staging admin UI mints signed URLs to real operators' SIUP, NPWP,
vessel licences and insurance certificates — reachable by anyone with that
seeded QA admin login. Create a private bucket named exactly
`operator-documents` in the staging Supabase project and replicate the storage
policies; uploads go through the **anon** key, so anon `INSERT` must be allowed.

### `PAYPAL_IS_PRODUCTION=false` is not a safety guard

Unlike DOKU — where `baseUrl()` in `src/features/payments/doku.ts` picks the host with no
fallback — `accessToken()` in `src/features/payments/paypal.ts` retries the *other* host on a
`401 invalid_client` and caches whichever one accepts the credentials. So live
PayPal keys sitting in the staging project charge real customers real money;
the flag costs one wasted round-trip and logs a warning suggesting you flip it.
**Putting sandbox credentials there is the only mechanism.** `pnpm
paypal:selftest` asks both hosts and names the one that answers.

`SMTP_*`, `INBOX_IMAP_*` and `WHATSAPP_*` are left unset on staging unless a test needs them. Neither transport has an
environment guard — they send to whatever address or number is on the booking,
so a production dump restored into staging would message real customers. Unset,
both log to the console and the rendered output still shows in function logs.

DOKU has no sandbox account for this merchant (`api-sandbox.doku.com` rejects
the live credentials), so staging runs DOKU in mock mode and uses the built-in
dummy checkout at `/checkout/[reference]`. A consequence worth knowing:
`verifyDokuNotification()` fails closed when DOKU is unconfigured, so
`/api/webhooks/doku` returns 401 on staging and DOKU webhook changes can only
be exercised in production.

## Route groups

| Path | Audience | Guard |
|---|---|---|
| `src/app/(customer)/[locale]/…` | anonymous + logged-in customers | none |
| `src/app/operator/…` | operator back office | `requireOperator()`, scoped by `operatorId` |
| `src/app/admin/…` | platform admin | `requireAdmin()` |
| `src/app/admin/(authed)/console/…` | owner only | `requireSuperAdmin()` |
| `src/app/api/…` | REST, webhooks, cron | signature or `CRON_SECRET` |

`proxy.ts` (Next 16's renamed middleware) handles locale routing only and
performs **no** auth, so every page, server action and route handler must call
its own guard. A missing guard is an open endpoint with nothing behind it.

## Single sources of truth

Duplicating any of these is a bug:

| Concern | Module |
|---|---|
| Booking totals, commission split, service fee | `src/features/pricing/pricing.ts` |
| Platform economics resolution | `src/shared/server/platform-config.ts` |
| Refund tiers and deadlines | `src/features/refunds/refunds.ts` |
| Seat holds and booking lifecycle | `src/features/booking/engine.ts` |
| What a gateway callback does to a booking (routes, retry cron and admin Retry share it) | `src/features/payments/webhook-processor.ts` |
| Per-departure rows | `src/features/schedules/legs.ts` |
| WITA formatting | `src/shared/lib/datetime.ts` |
| Port names | `src/features/ports/port-info.ts` |
| QR / ticket codes | `src/features/tickets/qr.ts`, `src/features/booking/references.ts` |
| Coupon validation and redemption | `src/features/pricing/promotions.ts` |
| What the platform does | `src/features/diagnostics/feature-catalog.ts` |

## Review MCP

`POST /api/mcp` is a read-only MCP endpoint for a reviewer who must be able to
inspect the platform without changing it. Ten tools: the feature inventory,
platform metrics, operators, bookings, refunds, coupons, customer lookup and
upcoming departures.

Enable it by setting `MCP_REVIEWER_TOKEN` (32+ chars). While it is unset the
endpoint returns 503, so it never serves unauthenticated. Give the reviewer:

```bash
claude mcp add --scope user --transport http gilifast-review \
  https://<your-host>/api/mcp \
  --header "Authorization: Bearer <token>"
```

Deliver the token through a password manager, not chat. Revoke by rotating
`MCP_REVIEWER_TOKEN` and redeploying — one variable, no database change.

**Why HTTP rather than a local stdio server.** The reviewer never holds a
database credential. A credential would let them bypass these tools entirely
with `psql`, which is why the tool surface alone is not a security boundary.
Two layers keep it read-only: no tool writes, and every query goes through
`src/mcp/readonly-client.ts`, a Prisma extension that throws on any mutating
operation even though the app's own credential is read-write.
`tests/unit/mcp/readonly.test.ts` proves the guard refuses writes and that
nothing under `src/mcp` imports a module that mutates.

Set `MCP_REDACT_PII=1` to mask customer name, email and phone in tool output.
It is off by default, since the reviewer is authorised to read customer records
— but note anything a tool returns is copied into the reviewer's local client
history and their model provider's logs, which is a wider audience than a
dashboard session.

## Known gaps

Honest state, so nobody plans against features that do not work:

- **WhatsApp webhook.** `/api/webhooks/whatsapp` answers Meta's verification (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`) and logs delivery statuses of the messages we send to `/admin/webhooks` (provider `whatsapp`, signature `WHATSAPP_APP_SECRET`). Replies are counted, not stored, and drive nothing. Sending does not need the webhook. A callback URL behind Vercel Authentication (staging) needs the Protection Bypass secret in its query string.

- **Unscheduled cron endpoints.** `send-reminders` and `poll-bmkg` are
  implemented and callable but absent from `vercel.json`, so departure
  reminders and BMKG weather never run on their own. Only `retry-webhooks`,
  `topup-legs`, `refresh-fx` and `poll-operator-inbox` (every 5 minutes) are
  scheduled there. The inbox poll only forwards for real when
  `INBOX_POLL_LIVE=true`; otherwise it is a dry run.
- **Live keys must be set in the hosting environment, not just in a
  dashboard.** Until `DOKU_CLIENT_ID` and `DOKU_SECRET_KEY` are set the app
  runs in mock mode and takes no real money — checkout falls back to the
  built-in dummy flow. `/admin/diagnostics` shows which integrations are live.
- **`PAYPAL_IS_PRODUCTION` picks the host, and getting it wrong looks like
  nothing.** The same keys are accepted by exactly one of `api-m.paypal.com`
  and `api-m.sandbox.paypal.com`; sent to the other they come back 401
  `invalid_client`, and the app responds by not offering PayPal at all rather
  than showing a button that fails on click. So a box with live keys and
  `PAYPAL_IS_PRODUCTION=false` has DOKU only, silently. `pnpm paypal:selftest`
  asks both hosts and names the one that accepts them; it only requests a
  token, so it is safe to run against live keys.
- **The DOKU notification URL is signed.** DOKU includes the request path in
  the signature, so the URL registered in the DOKU Back Office must match
  `{APP_BASE_URL}/api/webhooks/doku` exactly — a mismatch fails verification
  even with the right secret, and looks identical to a wrong key.
- **DOKU refunds are manual.** `refundViaGateway` returns null, so refunds are
  raised in the DOKU dashboard and recorded here; nothing calls a refund API.
- **Placeholders.** `armada/bahan-bakar` (fuel) and `armada/pemeliharaan`
  (maintenance) render empty states labelled "Phase B+". No data model exists.
- **Schema-only.** `LoyaltyAccount`, `LoyaltyTransaction`, `BoatPosition`,
  `WeatherForecast` and `BookingAddon` have no UI at all.
- **Reporting, not subsystems.** `pajak`, `penggajian` and `akuntansi` are
  derived views over `Booking`, `OperatorStaff`, `TravelAgent` and
  `CashDrawerSession`. There are no tax or payroll models, and nothing is filed
  or paid from them.
- **No read-only role.** `AdminRole` is `SUPER_ADMIN | STAFF`, and `STAFF` is
  not read-only — a STAFF admin can approve refunds and suspend operators.
- **`REQUIREMENTS.md` is a stub** pointing at a spec that is not in this repo.
  Prefer `CLAUDE.md` and `src/features/diagnostics/feature-catalog.ts`.

## Repository layout

```
src/app/
  (customer)/[locale]/  — search, booking, checkout, tickets, account, blog
  operator/             — back office (Indonesian nav; English canonical routes)
  admin/(authed)/       — operator onboarding, bookings, webhook log, refunds, reschedules
    console/            — owner-only coupons + platform economics
  api/                  — REST, DOKU/Xendit webhooks, cron (incl. the operator-inbox poll)
  print/                — printable tickets and manifests
src/features/           — domain logic, one folder per domain
  booking/              — engine, expiry, helpers, notifications, references (+ components/)
  pricing/              — pricing, fares, fx, promotions
  payments/             — doku, paypal, psp, webhook-processor, webhook-events
  refunds/  tickets/  schedules/  operators/  ports/  messaging/  diagnostics/
src/shared/             — cross-cutting, must not import features/ or app/
  server/               — db, auth, env, audit, login-throttle, platform-config
  lib/                  — datetime, utils, serialize-decimals, countries
  ui/                   — shadcn-style primitives
src/mcp/                — read-only review MCP server
prisma/
  schema.prisma         — 38 models, 41 enums
  seed.ts               — demo data
scripts/
  seed-qa.ts            — deterministic QA data
  db-migrate-if-configured.mjs
tests/
  unit/                 — vitest; mirrors src/ (features/<domain>, shared/, app/, mcp/)
  e2e/                  — Playwright golden paths
docs/                   — phased design notes
src/messages/               — en / id / zh / ja translations
```

## Conventions

- TypeScript strict, no `any`
- Server actions live in `src/app/**/actions.ts`; they `redirect()` on success,
  throw on failure, and re-throw `NEXT_REDIRECT`
- Forms are React Hook Form + Zod; the same schema re-validates server-side
- All money is `Prisma.Decimal`, integer rupiah
- Times stored UTC, rendered through `src/shared/lib/datetime.ts`
- Tailwind only; extend `src/shared/ui/*` rather than adding a component library
- Operator queries always include `operatorId`; use `operatorScope(session)`
- Every state change on booking / payment / refund / leg / operator writes to
  `AuditLog`
- `pnpm qc` must pass before committing

See `CLAUDE.md` for the full working agreement.
