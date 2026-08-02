# Gilijet

Small-boat ticketing platform for Indonesia — customer booking, an operator
back office, and a platform admin console. Mobile-first, built on Next.js 15 +
Prisma + Postgres. All customer-facing times are **WITA (Asia/Makassar)**.

> **Status:** live MVP. Customers can search, book, pay and check in; operators
> run schedules, departures, POS, cash and reporting; admins onboard operators,
> handle refunds and tune platform economics.
>
> `lib/feature-catalog.ts` is the canonical inventory of what exists — 57
> entries, each with its routes, owning modules and Prisma models, and a status
> that distinguishes shipped from partial, placeholder and schema-only. Read it
> before assuming a feature works; a few routes exist without being finished.

## Stack

- **Web:** Next.js 15 (App Router, React 19), Tailwind, shadcn-style UI
- **DB:** PostgreSQL (Supabase) via Prisma 6
- **Auth:** JWT in HttpOnly cookies (`jose` + `bcryptjs`), separate cookies per
  audience (customer / operator / admin)
- **Payments:** Midtrans Snap. Xendit remains wired for legacy refunds and
  diagnostics only
- **Email:** Resend, with a mock fallback when `RESEND_API_KEY` is absent
- **Storage:** Supabase Storage, for operator KYB documents
- **i18n:** `next-intl` — `en`, `id`, `zh`, `ja` on the customer surface

Integrations degrade to mocks rather than crashing when keys are missing, so a
bare clone runs.

## Quickstart

```bash
pnpm install

cp .env.example .env.local     # Next.js reads .env.local in dev
# Required: DATABASE_URL, AUTH_SECRET (16+ chars), QR_HMAC_SECRET (32+ chars)

pnpm db:push                   # apply schema (no migrations dir — see below)
pnpm seed:qa                   # deterministic QA data with fixed IDs
pnpm dev
```

QA seed logins (from `scripts/seed-qa.ts`, all password `qaqaqaqa`):

| Role | Email | Entry point |
|---|---|---|
| Admin | `qa-admin@gilijet.local` | `/admin/login` |
| Operator | `qa-operator@gilijet.local` | `/operator/login` |
| Customer | `qa-customer@gilijet.local` | `/account/login` (redirects to `/en/…`) |

`pnpm db:seed` instead loads the fuller demo set, defaulting to
`admin@gilijet.local` / `changeme123`.

> **Rotate that password before any deploy.** `docker-compose.yml` defaults
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

## Database

There is **no `prisma/migrations/` directory**. Schema changes reach the
database via `prisma db push`, run from `scripts/db-push-if-configured.mjs`
during the build.

The URL is resolved from several env-var names, because the Vercel–Supabase
integration provisions `POSTGRES_*` rather than `DATABASE_URL`:

| Purpose | Names tried, in order |
|---|---|
| Runtime queries (pooled, `:6543`) | `DATABASE_URL` → `POSTGRES_PRISMA_URL` → `POSTGRES_URL` |
| DDL / `db push` (direct, `:5432`) | `DIRECT_URL` → `POSTGRES_URL_NON_POOLING` |

Import `prisma` from `lib/db.ts`; do not read those env vars anywhere else.
DDL cannot run through the pgBouncer pooler, which is why the direct URL is
separate. A build that cannot resolve a database now fails rather than
silently skipping the push — schema drift used to reach production and take
every login page down with `P2021`.

Soft deletes: `Operator`, `Boat` and `Schedule` carry `deletedAt`, so list
queries must filter `deletedAt: null`.

## Route groups

| Path | Audience | Guard |
|---|---|---|
| `app/(customer)/[locale]/…` | anonymous + logged-in customers | none |
| `app/operator/…` | operator back office | `requireOperator()`, scoped by `operatorId` |
| `app/admin/…` | platform admin | `requireAdmin()` |
| `app/admin/(authed)/console/…` | owner only | `requireSuperAdmin()` |
| `app/api/…` | REST, webhooks, cron | signature or `CRON_SECRET` |

`middleware.ts` handles locale routing only and performs **no** auth, so every
page, server action and route handler must call its own guard. A missing guard
is an open endpoint with nothing behind it.

## Single sources of truth

Duplicating any of these is a bug:

| Concern | Module |
|---|---|
| Booking totals, commission split, service fee | `lib/pricing.ts` |
| Platform economics resolution | `lib/platform-config.ts` |
| Refund tiers and deadlines | `lib/refunds.ts` |
| Seat holds and booking lifecycle | `lib/booking-engine.ts` |
| Per-departure rows | `lib/legs.ts` |
| WITA formatting | `lib/datetime.ts` |
| Port names | `lib/port-info.ts` |
| QR / ticket codes | `lib/qr.ts`, `lib/references.ts` |
| Coupon validation and redemption | `lib/promotions.ts` |
| What the platform does | `lib/feature-catalog.ts` |

## Review MCP

`POST /api/mcp` is a read-only MCP endpoint for a reviewer who must be able to
inspect the platform without changing it. Ten tools: the feature inventory,
platform metrics, operators, bookings, refunds, coupons, customer lookup and
upcoming departures.

Enable it by setting `MCP_REVIEWER_TOKEN` (32+ chars). While it is unset the
endpoint returns 503, so it never serves unauthenticated. Give the reviewer:

```bash
claude mcp add --scope user --transport http gilijet-review \
  https://<your-host>/api/mcp \
  --header "Authorization: Bearer <token>"
```

Deliver the token through a password manager, not chat. Revoke by rotating
`MCP_REVIEWER_TOKEN` and redeploying — one variable, no database change.

**Why HTTP rather than a local stdio server.** The reviewer never holds a
database credential. A credential would let them bypass these tools entirely
with `psql`, which is why the tool surface alone is not a security boundary.
Two layers keep it read-only: no tool writes, and every query goes through
`lib/mcp/readonly-client.ts`, a Prisma extension that throws on any mutating
operation even though the app's own credential is read-write.
`tests/unit/mcp-readonly.test.ts` proves the guard refuses writes and that
nothing under `lib/mcp` imports a module that mutates.

Set `MCP_REDACT_PII=1` to mask customer name, email and phone in tool output.
It is off by default, since the reviewer is authorised to read customer records
— but note anything a tool returns is copied into the reviewer's local client
history and their model provider's logs, which is a wider audience than a
dashboard session.

## Known gaps

Honest state, so nobody plans against features that do not work:

- **Unscheduled cron endpoints.** `send-reminders` and `poll-bmkg` are
  implemented and callable but scheduled nowhere, so departure reminders and
  BMKG weather never run on their own. `refresh-fx` is now scheduled hourly by
  the `cron` service in `docker-compose.yml` (PayPal refuses to quote on a
  stale rate, so it cannot be optional); add further routes to the `for route
  in …` list there. Note `vercel.json` is inert on the droplet — Vercel Cron
  does not exist there, so anything scheduled only in that file never fires.
- **Live PayPal needs `APP_DOMAIN` set.** PayPal will not register or post to
  an `http://` webhook URL, so on a bare IP the droplet cannot receive live
  notifications. Setting `APP_DOMAIN` in `~/.gilijet/.env` to a domain whose A
  record points at the box makes the `caddy` service issue and renew a Let's
  Encrypt certificate automatically, and `deploy.sh` rewrites `APP_BASE_URL` to
  match. Left blank the box serves plain HTTP as before — fine for sandbox
  PayPal and for Midtrans, which accepts HTTP notifications on :80. Note that
  until DNS resolves, Caddy cannot obtain a certificate and the site will not
  serve. Capture happens server-side on return from PayPal either way, so a
  booking paid in a normal browser round-trip is ticketed without the webhook;
  what a missing webhook costs is the backstop for a customer who closes the
  tab mid-payment.
- **Live keys must be present on the server, not just in a dashboard.** Until
  they are set in `~/.gilijet/.env` the app runs those gateways in mock mode
  and takes no real money. Midtrans needs *both* `MIDTRANS_SERVER_KEY` and
  `MIDTRANS_CLIENT_KEY` — the server key signs the transaction call, the client
  key authenticates Snap.js in the browser, and without it the popup never
  opens. `deploy.sh` prints which integrations are live at the end of every
  deploy. Midtrans notifications reach the droplet over plain HTTP on :80,
  which Midtrans accepts (unlike PayPal), so Midtrans live is not blocked on
  TLS — though HTTPS is still what you want before real money moves.
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
  Prefer `CLAUDE.md` and `lib/feature-catalog.ts`.

## Repository layout

```
app/
  (customer)/[locale]/  — search, booking, checkout, tickets, account, blog
  operator/             — back office (Indonesian nav; English canonical routes)
  admin/(authed)/       — operator onboarding, bookings, refunds, reschedules
    console/            — owner-only coupons + platform economics
  api/                  — REST, Midtrans/Xendit webhooks, cron
  print/                — printable tickets and manifests
components/
  ui/                   — shadcn-style primitives
  operator-shell/       — operator nav, sidebar module tree, page templates
lib/                    — 42 modules; see "single sources of truth" above
prisma/
  schema.prisma         — 38 models, 41 enums
  seed.ts               — demo data
scripts/
  seed-qa.ts            — deterministic QA data
  db-push-if-configured.mjs
tests/
  unit/                 — vitest, pure functions only
  e2e/                  — Playwright golden paths
docs/                   — phased design notes
messages/               — en / id / zh / ja translations
```

## Conventions

- TypeScript strict, no `any`
- Server actions live in `app/**/actions.ts`; they `redirect()` on success,
  throw on failure, and re-throw `NEXT_REDIRECT`
- Forms are React Hook Form + Zod; the same schema re-validates server-side
- All money is `Prisma.Decimal`, integer rupiah
- Times stored UTC, rendered through `lib/datetime.ts`
- Tailwind only; extend `components/ui/*` rather than adding a component library
- Operator queries always include `operatorId`; use `operatorScope(session)`
- Every state change on booking / payment / refund / leg / operator writes to
  `AuditLog`
- `pnpm qc` must pass before committing

See `CLAUDE.md` for the full working agreement.
