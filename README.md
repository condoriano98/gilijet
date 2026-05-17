# Gilijet

Small-boat ticketing platform for Indonesia. Mobile-first PWA built on
Next.js 15 + Prisma + Postgres.

> **Status:** Phase 1 (Foundation) — auth, schema, admin UI for operators.
> See `REQUIREMENTS.md` for the full MVP plan.

## Stack

- **Web:** Next.js 15 (App Router, React 19), Tailwind, shadcn-style UI
- **DB:** PostgreSQL (Supabase or Neon) via Prisma
- **Auth:** JWT in HttpOnly cookies (`jose` + `bcryptjs`), separate
  cookies for operators and admins
- **Payments:** Xendit (Phase 2)
- **Comms:** Resend (email) + Wati/Twilio (WhatsApp) — Phase 4

## Quickstart

```bash
# 1. Install deps
npm install

# 2. Copy env, fill in DATABASE_URL + AUTH_SECRET + QR_HMAC_SECRET
cp .env.example .env

# 3. Push schema to your DB and seed a sample admin + operator
npm run db:push
npm run db:seed

# 4. Run the dev server
npm run dev
```

Default seed credentials (override via `SEED_*` env vars):

- Admin: `admin@gilijet.local` / `changeme123` → http://localhost:3000/admin/login
- Operator: `operator@example.com` / `changeme123` → http://localhost:3000/operator/login

## What's in Phase 1

- [x] Prisma schema covering operators, boats, schedules, legs, bookings,
      tickets, payments, refunds, audit log
- [x] Operator + admin authentication (JWT cookies)
- [x] Admin UI: onboard, approve, suspend operators
- [x] Operator dashboard skeleton + boat list
- [x] Pricing + refund + QR signing libraries
- [x] Xendit webhook signature verification stub

## What's next

- **Phase 2:** Search → book → pay (Xendit) → e-ticket
- **Phase 3:** Operator schedules, departures, web QR scanner
- **Phase 4:** Refunds, WhatsApp delivery, reminders, settlements

## Repository layout

```
app/
  (public)        — landing page
  admin/          — admin login + management
  operator/       — operator login + dashboard
components/ui     — shadcn-style components
lib/
  auth.ts         — JWT sessions
  db.ts           — Prisma client
  env.ts          — zod-validated env
  pricing.ts      — commission math (Decimal-safe)
  refunds.ts      — refund-tier policy
  qr.ts           — HMAC-signed QR payloads
  references.ts   — booking/ticket references
  audit.ts        — audit-log helper
  xendit.ts       — Xendit wrapper (webhook verify ready)
prisma/
  schema.prisma
  seed.ts
```

## Conventions

- TypeScript strict, no `any`
- Zod-validate all server-action input
- All money is `Prisma.Decimal` (IDR, integer rupiah)
- Times stored UTC; rendered with `Asia/Makassar` formatters
- Every state change on booking/payment/refund/leg/operator → `AuditLog`
