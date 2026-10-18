# Gilifast — Repo structure

Boat-ticketing MVP: Next.js (App Router) + Prisma/Postgres + `next-intl`, deployed on Vercel. Behavioural rules (auth guards, tenant scoping, single sources of truth) live in [`CLAUDE.md`](./CLAUDE.md) — read it first. This file only maps *where things are* and *why*.

Package manager: `pnpm` (single lockfile). Commands: `pnpm dev`, `pnpm qc` (lint + typecheck), `pnpm test:unit` (Vitest), `pnpm test:e2e` (Playwright), `pnpm seed:qa`, `pnpm seed:seasons`, `pnpm seed:one-rupiah` (Rp 1 staging departure), `pnpm db:deploy` / `db:migrate` / `db:status`.

## Top level

```
src/            All application code (alias: @/* -> ./src/*)
CHANGELOG.md    Release notes per version (see docs/RELEASING.md)
prisma/         schema.prisma, migrations/ (SQL history; RLS goes in the migration too), seed.ts, seed-small-boats.ts
scripts/        One-off scripts (seed-qa, Wahana import/generate, doku/paypal selftests, purge-dummy-data)
tests/          unit/ (Vitest, mirrors src/), e2e/ (Playwright), support/
docs/           Design docs; RELEASING.md = versioning & releases; docs/spikes/ = in progress, docs/spikes/done/ = finished
public/         Static assets
vercel.json     Vercel cron schedule (must stay at repo root)
.github/        CI (pnpm install --frozen-lockfile, lint, typecheck, unit)
.claude/        Subagents (agents/) and session-start hook
(root configs)  next, tailwind, postcss, eslint, vitest, playwright, tsconfig
```

## `src/` — layers

Imports point one way: **`app` → `features` → `shared`**. Enforced in `eslint.config.mjs` via `no-restricted-imports`:

- `shared/` must not import `features/`, `app/` or `mcp/`.
- `features/` and `mcp/` must not import `app/`.
- Features *may* import each other. The booking → payments → tickets → messaging chain is one interlocking flow (e.g. `booking/engine` → `payments/doku`, `tickets/ticket-issuer` → `booking/engine`, `payments/psp` → `tickets/ticket-issuer`), so a "no cross-feature imports" rule would only produce churn.

```
src/
  app/              Routing: page / layout / route / actions + route-private _components/
  features/         Domain logic, one folder per domain
  shared/           Cross-cutting building blocks (lowest layer)
  mcp/              Read-only review MCP server (tools, readonly-client, serialize)
  i18n/             next-intl routing + request config (operator/ has en, id)
  messages/         Customer translations: en, id, ja, zh
  content/blog/     Blog content
  proxy.ts          next-intl middleware (localizes only app/(customer)/[locale])
```

### `src/app/`

| Path | Audience | Notes |
|---|---|---|
| `(customer)/[locale]/…` | Customers | Localized. search, book, checkout, pay, b (booking lookup), account, change-plans, refunds, reviews, blog, about, contact, terms, privacy, best-price-guarantee, demo |
| `operator/…` | Operators | Not localized. Must call `requireOperator()`. Indonesian module names in the sidebar; English paths (`schedules`, `legs`, `boats`, `scanner`) hold the real pages |
| `admin/(authed)/…` | Platform admin | `requireAdmin()` / `requireSuperAdmin()`. bookings, confirmations, webhooks, refunds, reschedules, operators, operations, promos, diagnostics, console |
| `api/…` | Machines | `webhooks/{doku,paypal,resend-inbound}`, `cron/*` (`CRON_SECRET`), `auth/*`, `bookings/[reference]`, `promos/validate`, `operator/*`, `admin/bookings`, `mcp` |
| `print/…`, `legal/…` | Printables / static legal | |

Route-private components live in `_components/` beside the route that uses them (customer: `book/[legId]`, `search`, `pay/[reference]`, `checkout/[reference]`, `b/[reference]`, `account`, `reviews/new`, `[locale]` home; layout-level in `(customer)/_components`; operator: `operator/_components` (sidebar, top-bar) and `scanner/_components`).

### `src/features/`

| Domain | Contents |
|---|---|
| `booking/` | `engine` (seat hold/confirm race), `expiry`, `helpers`, `display`, `notifications`, `references`, `components/` (booking-progress, payment-countdown) |
| `pricing/` | `pricing` (`computeBookingPrice`), `fares`, `seasons` (season calendar -> fare), `erp-pricing`, `fx`, `promotions` |
| `payments/` | `doku`, `paypal`, `psp`, `webhook-processor` (what a callback does), `webhook-events` (WebhookEvent bookkeeping), `payment-mode`, `components/` |
| `refunds/` | `refunds` (tier math), `refund-gateway` |
| `tickets/` | `ticket-issuer` (payment → ticket gate), `qr`, `qr-render`, `boarding-pass`, `leg-checkin`, `operator-ticket-email` (forward the operator's ticket email to the buyer), `operator-ticket-parse` |
| `schedules/` | `legs`, `connection-search`, `sales-channel`, `wahana-schedule` (generated), `home-data`, `components/` (search-form, days-picker) |
| `operators/` | `data` (active-entity helpers), `erp-queries`, `documents`, `purge`, `components/templates/` (list/detail/form page templates) |
| `ports/` | `port-info`, `geo`, `sea-conditions`, `weather-policy`, `destination-photos` |
| `messaging/` | `email`, `whatsapp`, `admin-alerts`, `pic-notifications`, `resend-inbound` (Svix check + email fetch) |
| `diagnostics/` | `feature-catalog` (checked by a drift test) |

### `src/shared/`

- `server/` — `db` (the only Prisma client), `auth`, `env`, `audit`, `login-throttle`, `platform-config`, `google-oauth`, `build-info` (running version + commit)
- `lib/` — `datetime` (WITA), `utils`, `serialize-decimals`, `countries`
- `ui/` — shadcn-style primitives

## Where does new code go?

1. Used by one route only → `_components/` next to it.
2. Used by several routes of one domain → `features/<domain>/components/`.
3. Domain logic → `features/<domain>/`. Needs a new domain only if it doesn't fit an existing one.
4. Infra / pure helpers with no domain knowledge → `shared/server/` or `shared/lib/`. Never import `features/` from there.
5. Generic UI primitive → `shared/ui/`.

## Tests

- `tests/unit/` mirrors `src/`: `features/<domain>/`, `shared/{lib,server}/`, `app/` (route handlers, tenant guards, page-source checks) and `mcp/`. A test for `src/features/booking/engine.ts` lives at `tests/unit/features/booking/engine.test.ts`. Use the `@/` alias for imports; a few tests read source files by `process.cwd()` + `src/…` path — moving a source file means updating those.
- `tests/support/test-utils.ts` — shared mock factories (currently imported by no test).
- `tests/e2e/*.spec.ts` — Playwright golden paths. Run `pnpm seed:qa` first.

## Known leftovers

- **Unused components** (no importer found): `features/payments/components/{auto-redirect,countdown,methods}.tsx` and `features/operators/components/templates/form-page-template.tsx`. Kept, not deleted — decide whether they are WIP or dead.
- **Operator "duplicate routes"** are not duplicates: `operator/operasi/{jadwal,keberangkatan,pemindai}` and `operator/armada/page.tsx` are 4-line `redirect()` stubs to the English routes. The sidebar picks the active module by `pathname.startsWith(module.href)`, so linking straight to `/operator/schedules` would lose the active module. Removing the stubs needs a sidebar change (per-module prefix list), which is a behaviour change, not a restructure.
- `next.config.mjs` still has `output: process.env.VERCEL ? undefined : 'standalone'` (a Docker-era branch) and older design docs (`docs/db-expansion-plan.md`, `docs/home-page-revamp*.md`) still use the old `lib/` paths and, in places, `db push` (the `home-page-revamp*` docs carry a dated status note since 2026-10-14).
- `features/schedules/wahana-schedule.ts` is ~2,200 lines of generated data (`pnpm gen:wahana`); it could move to a `data/` folder.
