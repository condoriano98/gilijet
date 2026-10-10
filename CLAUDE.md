# Gilifast — Agent rules

Next.js 14 / App Router boat-ticketing MVP. Postgres via Prisma. Auth via signed HttpOnly cookies (`jose`). Payments via DOKU Checkout (mock when keys absent). Timezone for all customer-facing times is **WITA (Asia/Makassar)**.

## Route groups

- `src/app/(customer)/…` — anonymous + logged-in customer flows. Wrapped by the customer layout.
- `src/app/operator/…` — operator dashboard. Every page and server action must call `requireOperator()` from `src/shared/server/auth.ts` and filter Prisma queries by `operatorId: session.sub`.
- `src/app/admin/…` — platform admin. Every page and server action must call `requireAdmin()` (or `requireSuperAdmin()` for destructive ops).
- `src/app/api/…` — REST endpoints (webhooks, cron, JSON for client fetches). Cron routes must check `CRON_SECRET`. Webhook routes verify signatures via the helpers in `src/features/payments/doku.ts`.

Never bypass `requireOperator` / `requireAdmin` / `requireSuperAdmin`. If a page renders without them, that's a bug — fix it, don't work around it.

## Where code goes

Layers point one way: `src/app` → `src/features` → `src/shared`. ESLint enforces it (`no-restricted-imports`): `shared/` may not import `features/`, `app/` or `mcp/`; `features/` may not import `app/`. Features may import each other (booking, payments and tickets are one flow).

- Route-only component → `_components/` next to the route. Used by several routes of one domain → `src/features/<domain>/components/`. Primitive → `src/shared/ui/`.
- Domain logic → `src/features/<domain>/`. Infra (db, auth, env, audit) → `src/shared/server/`. Pure helpers (datetime, utils) → `src/shared/lib/`.
- Full map: `STRUCTURE.md`.

## Single sources of truth

- **Refund tiers** → `src/features/refunds/refunds.ts` (`computeRefundDeadline`, refund-fraction table). Do not duplicate the tier math anywhere else.
- **Pricing** → `src/features/pricing/pricing.ts` (`computeBookingPrice`). All booking totals go through this.
- **Seat reservation / booking lifecycle** → `src/features/booking/engine.ts`. The hold-vs-confirm race is here; new code that touches seats must reuse the engine, not re-implement it.
- **Legs (per-port-stop rows)** → generated from a Schedule via `src/features/schedules/legs.ts` `generateLegsForSchedule`. Operator manifests query Legs, not Schedules.
- **Time formatting** → `src/shared/lib/datetime.ts`. Never `new Date().toLocaleString()` without going through it (WITA correctness).
- **Port name canonicalisation** → `src/features/ports/port-info.ts`. Use it when displaying or comparing port codes.
- **Email** → `src/features/messaging/email.ts`. Mock-fallback handled there when `RESEND_API_KEY` is absent.
- **QR / ticket codes** → `src/features/tickets/qr.ts` + `src/features/booking/references.ts`. QR HMAC uses `QR_HMAC_SECRET`.
- **Payment → ticket gate** → `src/features/tickets/ticket-issuer.ts`. Settling money only moves a booking to `AWAITING_CONFIRMATION`; tickets are minted by `issueTicketsForBooking` after an admin confirms availability with the operator by phone at `/admin/confirmations`. Never issue a boarding pass straight from a payment path.
- **Customer notifications** → `src/features/booking/notifications.ts` (email + WhatsApp together). WhatsApp transport is `src/features/messaging/whatsapp.ts` (WATI, mock-falls-back when `WATI_*` absent).

## DB

- `src/shared/server/db.ts` reads the runtime URL from `DATABASE_URL` only. Do not read it directly elsewhere — import `prisma` from `src/shared/server/db.ts`.
- Prisma CLI commands (`prisma generate`, `db push`, `migrate`) read `DATABASE_URL` + `DIRECT_URL` from `prisma/schema.prisma`. In remote/CI environments with no real DB, `prisma generate` still works with a dummy `postgresql://x:x@localhost:5432/x` URL.
- Tenant scoping: operator-facing Prisma calls always include `operatorId: session.sub`. Use `operatorScope(session)` from `src/shared/server/auth.ts` for consistent `where` clauses. Customer-facing logged-in queries include `customerId: session.sub`. Admin queries are unscoped on purpose.
- Soft-delete: `Operator`, `Boat`, `Schedule`, `Port`, `OperatorStaff`, and `TravelAgent` have a `deletedAt` column. All list queries must filter `deletedAt: null`. Use the exported active-entity helpers from `src/features/operators/data.ts` (`activeBoat`, `activeSchedule`) for consistency.
- Hard-delete: every FK into the catalogue is `onDelete: Restrict`, so removing a row means walking its subtree bottom-up by hand. `deleteOperatorAction` in `src/app/admin/(authed)/operators/actions.ts` is the only place that does this, and it refuses whenever the subtree contains a `Payment`, `Refund` or `Ticket` — no financial-chain row is ever erased. Any new hard-delete must carry the same guard; prefer soft-delete.

## Conventions

- Server actions live in `src/app/**/actions.ts` (or inline in `page.tsx` as `"use server"` functions). They `redirect()` on success, throw on failure, and re-throw `NEXT_REDIRECT`.
- Forms are React Hook Form + Zod resolvers; the same Zod schema runs on the server inside the action.
- UI primitives in `src/shared/ui/*` are shadcn-style — copy/extend them, don't add new component libraries.
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
