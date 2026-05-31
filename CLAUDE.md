# Gilijet — Agent rules

Next.js 14 / App Router boat-ticketing MVP. Postgres via Prisma. Auth via signed HttpOnly cookies (`jose`). Payments via Xendit (mock when keys absent). Timezone for all customer-facing times is **WITA (Asia/Makassar)**.

## Route groups

- `app/(customer)/…` — anonymous + logged-in customer flows. Wrapped by the customer layout.
- `app/operator/…` — operator dashboard. Every page and server action must call `requireOperator()` from `lib/auth.ts` and filter Prisma queries by `operatorId: session.sub`.
- `app/admin/…` — platform admin. Every page and server action must call `requireAdmin()` (or `requireSuperAdmin()` for destructive ops).
- `app/api/…` — REST endpoints (webhooks, cron, JSON for client fetches). Cron routes must check `CRON_SECRET`. Webhook routes verify signatures via the helpers in `lib/xendit.ts` / `lib/mayar.ts`.

Never bypass `requireOperator` / `requireAdmin` / `requireSuperAdmin`. If a page renders without them, that's a bug — fix it, don't work around it.

## Single sources of truth

- **Refund tiers** → `lib/refunds.ts` (`computeRefundDeadline`, refund-fraction table). Do not duplicate the tier math anywhere else.
- **Pricing** → `lib/pricing.ts` (`computeBookingPrice`). All booking totals go through this.
- **Seat reservation / booking lifecycle** → `lib/booking-engine.ts`. The hold-vs-confirm race is here; new code that touches seats must reuse the engine, not re-implement it.
- **Legs (per-port-stop rows)** → generated from a Schedule via `lib/legs.ts` `generateLegsForSchedule`. Operator manifests query Legs, not Schedules.
- **Time formatting** → `lib/datetime.ts`. Never `new Date().toLocaleString()` without going through it (WITA correctness).
- **Port name canonicalisation** → `lib/port-info.ts`. Use it when displaying or comparing port codes.
- **Email** → `lib/email.ts`. Mock-fallback handled there when `RESEND_API_KEY` is absent.
- **QR / ticket codes** → `lib/qr.ts` + `lib/references.ts`. QR HMAC uses `QR_HMAC_SECRET`.

## DB

- `lib/db.ts` resolves the runtime URL from `DATABASE_URL` / `POSTGRES_PRISMA_URL` / `POSTGRES_URL` (in that order). Do not read those env vars directly elsewhere — import `prisma` from `lib/db.ts`.
- Prisma CLI commands (`prisma generate`, `db push`, `migrate`) read `DATABASE_URL` + `DIRECT_URL` from `prisma/schema.prisma`. In remote/CI environments with no real DB, `prisma generate` still works with a dummy `postgresql://x:x@localhost:5432/x` URL.
- Tenant scoping: operator-facing Prisma calls always include `operatorId: session.sub`. Customer-facing logged-in queries include `customerId: session.sub`. Admin queries are unscoped on purpose.

## Conventions

- Server actions live in `app/**/actions.ts` (or inline in `page.tsx` as `"use server"` functions). They `redirect()` on success, throw on failure, and re-throw `NEXT_REDIRECT`.
- Forms are React Hook Form + Zod resolvers; the same Zod schema runs on the server inside the action.
- UI primitives in `components/ui/*` are shadcn-style — copy/extend them, don't add new component libraries.
- Tailwind only. No CSS Modules, no styled-components.
- Prefer `Edit` over `Write` when modifying existing files.

## Build & test

- `pnpm lint` + `pnpm typecheck` must pass before any commit.
- `pnpm test:e2e` runs the Playwright golden-path suite (customer booking, operator manifest, admin refund).
- `pnpm seed:qa` loads deterministic QA data with fixed IDs (see `scripts/seed-qa.ts`).

## Don't

- Don't introduce new top-level libraries when shadcn/Tailwind/Radix already cover the need.
- Don't add backwards-compat shims, "removed" comments, or speculative abstractions.
- Don't write feature flags for one-shot changes.
- Don't add comments that restate the code. Only comment non-obvious WHY.
