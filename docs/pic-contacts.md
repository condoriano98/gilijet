# Operator PIC contacts (`OperatorPicContact`)

Contact channels (phone/email) for a boat operator's PIC (Person In Charge).
This is the data foundation for automating booking confirmation with the
operator side — currently done by an admin calling the operator by phone
(see `/admin/confirmations`, `lib/ticket-issuer.ts`). This table only stores
*who to contact*; the actual WhatsApp/email trigger automation and the
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

## RLS

`ALTER TABLE "OperatorPicContact" ENABLE ROW LEVEL SECURITY;`, no policies.

This app doesn't use Supabase Auth — `requireAdmin()` / `requireOperator()`
(custom JWT cookies, see `lib/auth.ts`) are the actual authorization
boundary, and the backend connects to Postgres directly via `DATABASE_URL`
(not through Supabase's PostgREST/anon-key layer). The connecting role is
this table's **owner** (it created the table via `prisma db push`), and
Postgres table owners bypass RLS by default — so the backend keeps reading
and writing normally. Enabling RLS with zero policies is defense-in-depth:
it denies any `anon` / `authenticated` role, i.e. blocks the table entirely
if it were ever exposed through Supabase's own Data API with a client-side
key.

## Known data gap

The source CSV (`trigger_tiket.csv`) has one corrupted value: WAHANA's
first `nohp_notifikasi` came through as `8.12346E+12` — a spreadsheet
scientific-notation artifact that lost the real digits. Seeding is on hold
until a correct number is supplied; do not guess the missing digits.
