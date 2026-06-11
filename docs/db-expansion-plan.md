# Database Expansion Plan & Requirements

**Audience:** an LLM implementing this without prior context from the planning conversation.
**Read first:** `CLAUDE.md`, `prisma/schema.prisma`, `lib/booking-engine.ts`, `lib/refunds.ts`, `lib/legs.ts`.
**Branch:** `claude/boat-ticketing-mvp-YAGl9`.
**Scope of this document:** Phase 1 is to be implemented now. Phase 2 is designed but not built. Phase 3 is awareness-only.

---

## Context

Gilijet is a Next.js 14 boat-ticketing MVP for Indonesian inter-island routes. Stack: Prisma + Postgres, jose-signed cookie auth, Xendit/Mayar/Midtrans for payments, WITA (Asia/Makassar) timezone. The database currently has 16 models and 11 enums but **no migrations folder** — schema management runs through `prisma db push` against an empty dev DB. There is no production data to preserve.

The schema is shaped correctly for the domain (Schedule template → Leg instance → Booking → Ticket, with Payment / Refund / WebhookEvent / AuditLog as side tables). The work below hardens it for feature expansion without rewriting anything.

**Non-goals:** new product features, UI changes, API additions, admin tooling. This is a schema-and-supporting-code-only change.

---

## Phase 1 — Foundation hardening (IMPLEMENT NOW)

Six structural fixes. Each is independent and can be reviewed separately, but ship them as one PR because they share `prisma db push` runs.

### 1.1 Denormalise `operatorId` onto `Leg` and `Booking`

**Problem.** Tenant scoping on operator queries currently traverses `Booking → Leg → Schedule → Boat.operatorId` (three joins). Per `CLAUDE.md` every operator query must filter by `operatorId: session.sub`; with the current shape, a forgotten join is a tenant leak.

**Change.**

```prisma
model Leg {
  ...
  operatorId String
  operator   Operator @relation(fields: [operatorId], references: [id], onDelete: Restrict)

  @@index([operatorId, departureDate])
}

model Booking {
  ...
  operatorId String
  operator   Operator @relation(fields: [operatorId], references: [id], onDelete: Restrict)

  @@index([operatorId, status])
  @@index([operatorId, createdAt])
}
```

**Where it's populated.**

- `lib/legs.ts` `generateLegsForSchedule` — copy `schedule.boat.operatorId` onto every `Leg` row it creates.
- `lib/booking-engine.ts` — at booking creation, copy `leg.operatorId` onto the new `Booking` row. Do **not** read it from the request payload; always derive it server-side.

**Acceptance.**

- All existing operator-facing queries under `app/operator/**` and `app/api/**` updated to filter on `operatorId` directly instead of `leg.schedule.boat.operatorId` (or `booking.leg.schedule.boat.operatorId`).
- Grep for `boat: { operatorId` and `schedule: { boat: { operatorId` — zero hits remain in operator code paths.
- A new helper in `lib/auth.ts` or `lib/operator-data.ts` named `operatorScope(session)` that returns `{ operatorId: session.sub }`, used everywhere.

---

### 1.2 Replace cascade-deletes on the financial chain with `Restrict`

**Problem.** `Boat → Schedule → Leg → Booking → Ticket → Payment` currently cascades. Deleting one operator destroys all paid tickets and financial records.

**Change.** Every relation in the financial chain becomes `onDelete: Restrict`:

```
Operator → Boat            : Restrict   (was Cascade)
Boat     → Schedule        : Restrict   (was Cascade — currently implicit)
Schedule → Leg             : Restrict   (was Cascade)
Leg      → Booking         : Restrict   (was default)
Booking  → Ticket          : Restrict   (was Cascade)
Booking  → Payment         : Restrict   (was Cascade)
Booking  → Refund          : Restrict   (was Cascade)
```

**Exceptions that keep `Cascade`:**
- `Customer → Review` (review is owned by the customer; deleting the customer is rare and we want their reviews gone with them if it ever happens)
- `Booking → RescheduleRequest` (a reschedule request only exists in the context of its booking)

**Acceptance.**

- Run `pnpm prisma generate` then `pnpm typecheck` — green.
- Document in `CLAUDE.md` (small append) that hard-deleting an Operator is now physically impossible while it has Boats. Operators are retired via `OperatorStatus.SUSPENDED` + `deletedAt` (see 1.3).

---

### 1.3 Soft-delete columns

**Change.** Add `deletedAt DateTime?` to:

- `Operator`
- `Boat`
- `Schedule`
- `Port` (when added in Phase 2 — not now)

**Rule.** All queries must filter `deletedAt: null` by default. Create a Prisma middleware OR a thin wrapper in `lib/db.ts` — **decision point for executor:** prefer the explicit wrapper approach (`activeOperators()`, `activeBoats()`, `activeSchedules()` helpers) over Prisma middleware. Middleware obscures behaviour and Prisma is deprecating `$use`.

**Acceptance.**

- Grep operator/admin pages — every list query goes through the helper or explicitly passes `deletedAt: null`.
- Admin pages have an "include archived" toggle that omits the filter; that's the only legitimate bypass.

---

### 1.4 Refund-policy snapshot on `Booking`

**Problem.** `Booking.refundDeadline` is stored, but the **tier table** used to compute refund fractions (see `lib/refunds.ts`) is not. If the tier table changes, historical refunds compute differently than they were quoted to the customer at booking time.

**Change.**

```prisma
model Booking {
  ...
  refundPolicySnapshot Json  // see shape below
}
```

**Shape (TypeScript type for `lib/refunds.ts`):**

```ts
export type RefundPolicySnapshot = {
  version: string;            // e.g. "2026-01" — bump whenever lib/refunds.ts table changes
  snapshotAt: string;         // ISO timestamp
  tiers: Array<{
    hoursBeforeDeparture: number;
    refundFraction: number;   // 0..1
  }>;
  // Resolved values for this specific booking, for fast read paths:
  deadline: string;           // ISO; mirrors refundDeadline for convenience
};
```

**Where it's written.** `lib/booking-engine.ts` at booking creation, by calling a new `lib/refunds.ts` export `snapshotCurrentPolicy(leg: Leg): RefundPolicySnapshot`.

**Where it's read.** `lib/refunds.ts` `computeRefundAmount(booking)` must prefer `booking.refundPolicySnapshot.tiers` over the live tier table. Falls back to live tiers only if the column is null (defensive — shouldn't happen).

**Acceptance.**

- New unit test (or test file under `tests/`) that:
  1. Creates a booking with current policy.
  2. Mutates the live tier table in memory.
  3. Asserts the booking's refund still computes against the snapshot.

---

### 1.5 Promote free-text fields to enums

**Change.**

```prisma
enum PaymentMethod {
  BANK_TRANSFER
  VA_BCA
  VA_BNI
  VA_BRI
  VA_MANDIRI
  VA_PERMATA
  GOPAY
  OVO
  DANA
  SHOPEEPAY
  LINKAJA
  QRIS
  CREDIT_CARD
}

enum PaymentProvider {
  XENDIT
  MAYAR
  MIDTRANS
}

enum RefundReason {
  CUSTOMER_REQUEST
  OPERATOR_CANCELLATION
  WEATHER
  ADMIN_OVERRIDE
}

model Payment {
  ...
  method          PaymentMethod
  gatewayProvider PaymentProvider @default(XENDIT)
}

model Refund {
  ...
  reason RefundReason
}
```

**Where it touches code.**

- `lib/xendit.ts`, `lib/mayar.ts`, `lib/midtrans.ts`, `lib/psp.ts`, `lib/webhook-processor.ts`, `lib/refund-gateway.ts` — all string literal `"xendit"`, `"gopay"`, `"customer_request"` etc. become enum members.
- Webhook handlers that receive a gateway's method string (e.g. Xendit returns `"GOPAY"` or `"OVO"`) need a normalising helper `lib/psp.ts` → `normalizePaymentMethod(raw: string): PaymentMethod` that throws on unknown values. Throwing forces us to add new enum members rather than silently dropping data.

**Acceptance.**

- Grep for `method: "` and `method: '` across `lib/**` and `app/**` — no string literals remain in payment / refund code paths.
- `pnpm typecheck` is green.

---

### 1.6 Audit-log type safety

**Change.** Promote two free-text fields on `AuditLog` to enums:

```prisma
enum AuditEntityType {
  BOOKING
  PAYMENT
  REFUND
  LEG
  SCHEDULE
  BOAT
  OPERATOR
  CUSTOMER
  TICKET
  PROMOTION
  RESCHEDULE_REQUEST
}

enum AuditUserRole {
  CUSTOMER
  OPERATOR
  ADMIN
  SYSTEM
}

model AuditLog {
  ...
  entityType AuditEntityType
  userRole   AuditUserRole?
}
```

`lib/audit.ts` updated accordingly. Typos in audit calls become compile errors instead of orphaned records.

---

## Phase 1 deliverable checklist

- [ ] `prisma/schema.prisma` updated with all six changes above
- [ ] `pnpm prisma generate` runs clean
- [ ] `pnpm typecheck` is green
- [ ] `pnpm lint` is green (or no worse than baseline — see CLAUDE.md note about `next lint` config)
- [ ] `lib/booking-engine.ts` writes `operatorId` and `refundPolicySnapshot` at booking creation
- [ ] `lib/legs.ts` writes `operatorId` to each generated `Leg`
- [ ] `lib/refunds.ts` exports `snapshotCurrentPolicy()` and reads from snapshot first
- [ ] `lib/audit.ts` uses the new enums
- [ ] New helper `operatorScope(session)` in `lib/auth.ts` (or `lib/operator-data.ts`) used in every operator-side query
- [ ] Soft-delete helpers `activeOperators()` etc. exported from a single module
- [ ] `scripts/seed-qa.ts` updated to populate the new columns (operatorId on Leg/Booking, refundPolicySnapshot on Booking, deletedAt as null)
- [ ] All existing Playwright e2e tests under `tests/e2e/` still pass
- [ ] One new unit test for the refund snapshot invariance (see 1.4)
- [ ] `CLAUDE.md` "Single sources of truth" section updated to mention `operatorScope` and the soft-delete helpers
- [ ] Commit message: `db: phase 1 schema hardening (operatorId denorm, refund snapshot, enum promotion, soft delete, restrict cascades)`
- [ ] Push to `claude/boat-ticketing-mvp-YAGl9`

---

## Phase 2 — Designed, NOT to be implemented yet

These models are designed now so Phase 1 doesn't paint us into a corner. **Do not add them to `schema.prisma` during this task.** Hold them for the sprint that actually builds the corresponding feature.

- `Schedule.daysOfWeek Int @default(127)` — recurrence bitmask. Filter in `generateLegsForSchedule`. Needed for bulk import.

### 2.1 `Port`

Promote `Schedule.originPort` / `destinationPort` (currently bare strings) to FKs.

```prisma
model Port {
  id         String   @id @default(cuid())
  slug       String   @unique     // "gili-trawangan", "padang-bai"
  name       String                // "Gili Trawangan"
  island     String?               // "Lombok"
  province   String?               // "Nusa Tenggara Barat"
  latitude   Decimal? @db.Decimal(9, 6)
  longitude  Decimal? @db.Decimal(9, 6)
  timezone   String   @default("Asia/Makassar")
  isActive   Boolean  @default(true)
  deletedAt  DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  originSchedules      Schedule[] @relation("OriginPort")
  destinationSchedules Schedule[] @relation("DestinationPort")
}
```

Migration path: add `originPortId` / `destinationPortId` alongside the strings, backfill via `lib/port-info.ts` canonicalisation, drop the strings in a follow-up. (When phase 1 lands there is no real data, so it can be a single change.)

### Port seed

When the Port model lands, seed these 10 canonical rows. Add a `shortCode String @unique @db.VarChar(3)` column to `Port` alongside the fields in 2.1 — a stable 3-letter code survives DB resets better than numeric IDs.

| name | shortCode | island/region | latitude | longitude |
|---|---|---|---|---|
| Serangan | SRG | Bali (South) | -8.7282 | 115.2475 |
| Sanur | SNR | Bali (South) | -8.6878 | 115.2632 |
| Padang Bai | PDB | Bali (East) | -8.5304 | 115.5072 |
| Gili Trawangan | GIT | Gili Islands | -8.3486 | 116.0411 |
| Gili Air | GIA | Gili Islands | -8.3625 | 116.0820 |
| Gili Meno | GIM | Gili Islands | -8.3553 | 116.0625 |
| Gili Gede | GIG | Lombok (SW) | -8.7100 | 116.0250 |
| Bangsal | BSL | Lombok (NW) | -8.5550 | 116.0700 |
| Nusa Penida | NPD | Penida | -8.7275 | 115.5444 |
| Labuan Bajo | LBJ | Flores | -8.4905 | 119.8758 |

### 2.2 `OperatorStaff`

Currently `Ticket.checkedInBy String?` is untyped and unattributable.

```prisma
model OperatorStaff {
  id           String           @id @default(cuid())
  operatorId   String
  email        String           @unique
  passwordHash String
  fullName     String
  role         OperatorStaffRole @default(GATE)
  status       OperatorStaffStatus @default(ACTIVE)
  lastLoginAt  DateTime?
  deletedAt    DateTime?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  operator   Operator @relation(fields: [operatorId], references: [id], onDelete: Restrict)
  checkIns   Ticket[] @relation("CheckedInBy")

  @@index([operatorId, status])
}

enum OperatorStaffRole {
  MANAGER   // can view manifests + reports
  GATE      // can check passengers in
}

enum OperatorStaffStatus {
  ACTIVE
  SUSPENDED
}
```

`Ticket.checkedInBy String?` → `Ticket.checkedInById String?` with FK to `OperatorStaff.id`.

### 2.3 `SeatHold`

Moves the hold/confirm race from `lib/booking-engine.ts` into a real DB row.

```prisma
model SeatHold {
  id          String         @id @default(cuid())
  legId       String
  sessionKey  String         // anonymous session id OR customer id
  seats       Int
  status      SeatHoldStatus @default(ACTIVE)
  expiresAt   DateTime
  bookingId   String?        @unique  // set when promoted to a real booking
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  leg     Leg     @relation(fields: [legId], references: [id], onDelete: Restrict)
  booking Booking? @relation(fields: [bookingId], references: [id], onDelete: SetNull)

  @@index([legId, status, expiresAt])
  @@index([sessionKey])
}

enum SeatHoldStatus {
  ACTIVE
  EXPIRED
  CONVERTED
  RELEASED
}
```

`Leg.availableSeats` becomes a **derived** value: `totalCapacity - sum(active holds) - sum(confirmed bookings)`. A cron in `app/api/cron/expire-holds/route.ts` flips expired holds to `EXPIRED`.

### 2.4 `NotificationLog`

Replaces `Booking.reminderSentAt` and generalises to every outbound message.

```prisma
model NotificationLog {
  id              String              @id @default(cuid())
  channel         NotificationChannel
  type            NotificationType
  recipient       String              // email / phone
  referenceType   String              // 'booking' | 'refund' | 'reschedule'
  referenceId     String
  status          NotificationStatus  @default(PENDING)
  providerRef     String?
  payloadSummary  Json?               // do not store full PII; just enough to debug
  sentAt          DateTime?
  failedReason    String?
  attempts        Int                 @default(0)
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@index([referenceType, referenceId])
  @@index([status, createdAt])
}

enum NotificationChannel { EMAIL WHATSAPP SMS }
enum NotificationType {
  BOOKING_CONFIRMED
  BOOKING_REMINDER_24H
  BOOKING_REMINDER_2H
  REFUND_APPROVED
  REFUND_REJECTED
  RESCHEDULE_APPROVED
  RESCHEDULE_REJECTED
  LEG_CANCELLED
  PASSWORD_RESET
}
enum NotificationStatus { PENDING SENT FAILED SUPPRESSED }
```

`Booking.reminderSentAt` is removed once this lands; the reminder cron checks the log instead.

### 2.5 `OperatorDocument`

`Operator.documentsVerified Boolean` is too coarse for KYC.

```prisma
model OperatorDocument {
  id           String                 @id @default(cuid())
  operatorId   String
  type         OperatorDocumentType
  fileUrl      String
  fileName     String?
  status       OperatorDocumentStatus @default(PENDING)
  verifiedBy   String?                // Admin.id
  verifiedAt   DateTime?
  rejectionNote String?
  expiresAt    DateTime?              // for licences with renewal dates
  createdAt    DateTime               @default(now())
  updatedAt    DateTime               @updatedAt

  operator Operator @relation(fields: [operatorId], references: [id], onDelete: Restrict)

  @@index([operatorId, type])
  @@index([status])
  @@index([expiresAt])  // for "expiring soon" admin dashboard
}

enum OperatorDocumentType {
  VESSEL_LICENSE
  SIUP                // Surat Izin Usaha Perdagangan
  NPWP                // tax ID document
  INSURANCE_CERTIFICATE
  CAPTAIN_LICENSE
  OTHER
}

enum OperatorDocumentStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
}
```

`Operator.documentsVerified Boolean` stays for now as a quick "all docs approved?" flag — derive it from the docs table.

---

## Phase 3 — Awareness only (do not design now)

Documented so Phase 2 doesn't preclude them. Each is one or two columns / one model when their time comes.

| Future feature        | Hangs off                | Schema cost when added                              |
|-----------------------|--------------------------|------------------------------------------------------|
| Travel agent / B2B    | `Booking`                | `Agent` model + `Booking.agentId`                    |
| Loyalty points        | `Customer`               | `LoyaltyAccount` + `LoyaltyTransaction`              |
| Fleet GPS / live map  | `Boat`                   | `BoatPosition` time-series (Timescale or partitioned)|
| Multi-currency        | `Booking.currency` exists| Add `exchangeRateSnapshot` column at booking time    |
| Insurance add-on      | `Booking`                | `BookingAddon` model with `type` enum                |
| Weather snapshot      | `Leg`                    | `WeatherSnapshot` model FK'd to Leg                  |

If any of these become Phase 2 priorities, design the model the same way 2.1–2.5 are designed above before implementation.

---

## Out of scope for this task

- New product features
- UI changes beyond what's required to compile (e.g. if an enum rename breaks a page, fix the page minimally)
- Admin tooling for the new tables
- Phase 2 or Phase 3 model creation
- Data migration scripts (DB is empty)
- Performance tuning beyond the indexes specified

---

## How to verify before pushing

```bash
pnpm install
pnpm prisma generate
pnpm typecheck
pnpm lint
pnpm seed:qa       # must succeed with the new columns populated
pnpm test:e2e      # golden paths must still pass
```

If any of the above fails: fix it. Do not skip hooks, do not `--no-verify`, do not push red.

---

## Open questions to flag back (do NOT decide unilaterally)

1. **Soft-delete enforcement strategy** — explicit helpers (`activeOperators()`) vs. Prisma `$extends` query extension. Recommendation: explicit helpers. Confirm before implementing.
2. **`Booking.refundPolicySnapshot` nullable or required?** Recommendation: nullable for now (so existing seed data doesn't break), but `lib/booking-engine.ts` always writes it. Add a `NOT NULL` constraint in a follow-up PR once seed data is regenerated.
3. **Enum naming for payment methods** — confirm the VA list (BCA / BNI / BRI / Mandiri / Permata) matches what Xendit currently returns in webhooks. If unsure, log unknown values to `WebhookEvent.errorMessage` rather than throwing in production code paths.

Flag these in the PR description and wait for review.
