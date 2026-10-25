# Operator PIC contacts (`OperatorPicContact`)

Contact channels (phone/email) for a boat operator's PIC (Person In Charge).
This is the data foundation for automating booking confirmation with the
operator side — currently done by an admin calling the operator by phone
(see `/admin/confirmations`, `lib/ticket-issuer.ts`). This table stores
*who to contact*. Since 2026-10-18 `src/features/messaging/pic-notifications.ts`
reads `nohpNotifikasi` and sends the "order paid" WhatsApp (e-ticket Part A,
`docs/spikes/in-progress/FEATURE_ETICKET_PIC_NOTIFICATION.md`). The email trigger and the
"first responder wins" race are not implemented yet — future work.

## Schema

```prisma
model OperatorPicContact {
  id                     String    @id @default(cuid())
  operatorId             String?
  nohpNotifikasi         String?
  emailNotifikasi        String?
  nohpKonfirmasiTrigger  String?
  emailKonfirmasiTrigger String?
  deletedAt              DateTime?
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  operator Operator? @relation(fields: [operatorId], references: [id], onDelete: Restrict)
}
```

## Relation to other tables

- **`Operator`** (many-to-one, `operatorId`, nullable): one operator can have
  several `OperatorPicContact` rows — e.g. multiple people who can be pinged.
  There is no unique constraint on `operatorId`; the CSV seed data already
  has two rows for the same operator (different notification numbers).
- `operatorId` is **nullable** to allow platform-level rows that aren't tied
  to any row in `Operator` — e.g. Gilifast's own internal contact, which
  appears in the source data but isn't a boat operator.
- `onDelete: Restrict` (same convention as every other FK into the
  catalogue, per `CLAUDE.md`): hard-deleting an `Operator` that still has
  PIC contact rows will fail until those rows are removed first.

## `notifikasi` vs `konfirmasi_trigger`

- `nohpNotifikasi` / `emailNotifikasi`: one-way notification (e.g. "a new
  booking came in"), no response expected.
- `nohpKonfirmasiTrigger` / `emailKonfirmasiTrigger`: the contact that must
  respond to confirm a departure is actually running before a booking's
  tickets get issued. When an operator has more than one trigger contact,
  whichever one responds first is the one that counts — that race is
  application logic for a future automation ticket, not enforced by this
  table (no `respondedAt` / priority column exists here).
  Since 1.4.0 `emailKonfirmasiTrigger` is also read by the e-ticket
  forward (`src/features/tickets/operator-ticket-email.ts`; since 1.5.0 the
  mailbox is polled over IMAP by `operator-ticket-inbox.ts`, which searches for
  mail from these addresses): an email is only accepted when its sender equals an operator's
  `emailKonfirmasiTrigger` (Wahana: `no-reply@virendrafastferry.com`).
  The platform row (`operatorId` null) is not a sender.

## RLS

`ALTER TABLE "OperatorPicContact" ENABLE ROW LEVEL SECURITY;`, no policies.

This app doesn't use Supabase Auth — `requireAdmin()` / `requireOperator()`
(custom JWT cookies, see `lib/auth.ts`) are the actual authorization
boundary, and the backend connects to Postgres directly via `DATABASE_URL`
(not through Supabase's PostgREST/anon-key layer). The connecting role is
this table's **owner** (it created the table via `prisma db push`, before migrations existed), and
Postgres table owners bypass RLS by default — so the backend keeps reading
and writing normally. Enabling RLS with zero policies is defense-in-depth:
it denies any `anon` / `authenticated` role, i.e. blocks the table entirely
if it were ever exposed through Supabase's own Data API with a client-side
key.

## Seed data

`scripts/seed-pic-contacts.ts` reads `trigger_tiket.csv` (repo root) and
inserts one row per CSV line, resolving `operatorId` by matching the CSV's
`companyname` column against `Operator.companyName`. It refuses to run if
the table already has rows (no dedupe key to make it safely re-runnable) —
clear the table first if a genuine reseed is needed:

```bash
pnpm tsx scripts/seed-pic-contacts.ts
```

An earlier version of the CSV had one corrupted value (a spreadsheet
scientific-notation artifact that ate a phone number's digits); the
current CSV has been corrected and fully seeded to staging.

> **Update 2026-10-18:** phone numbers are stored as `628…` digits (no `0`, no `+`); `seed-pic-contacts.ts` now normalizes them. Staging rows were fixed on 2026-10-18; **production rows still need the same fix** before Part A is released.

> **Update 2026-10-14:** `ENABLE ROW LEVEL SECURITY` on `OperatorPicContact` is recorded in migration `prisma/migrations/0_init`, so a database built from migrations matches the existing ones. See `docs/RELEASING.md`.
