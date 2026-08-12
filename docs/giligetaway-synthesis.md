# Giligetaway Data Synthesis — Action Plan

## Context

Giligetaway is a working B2B fast-boat platform that operates in Gilifast's exact market (Bali ↔ Gili ↔ Lombok ↔ Nusa Penida). Their public agent API at `https://giligetaway-agent-api.my.id` was studied on 2026-06-11. Three pieces of intel matter:

1. **Real market pricing** (June and July/August 2026 timetables) — useful as a seed-data anchor and a pricing sanity check.
2. **A canonical port list** the market actually uses.
3. **Schema warnings** — Giligetaway's API ships stringly-typed transit notation, currency-prefixed price strings, and natural-language `runningDays`. Their model is operationally rich but architecturally thin. Don't copy.

This plan turns those findings into concrete, scoped work. It is a hand-off doc for another model to execute.

---

## Scope guardrails (READ FIRST)

Three previous planning docs (`docs/db-expansion-plan.md`, `docs/home-page-revamp*.md`) all got scope-crept when handed off. Same rules apply here:

- **Do not** invent new phases, sub-phases, or extension proposals.
- **Do not** edit `CLAUDE.md`, `docs/db-expansion-plan.md`, `docs/home-page-revamp*.md`, or any agent-roster file. They are out of scope.
- **Do not** add new top-level dependencies. Everything below works with the libraries already in `package.json`.
- **Do not** build B2B API surface, agent auth, commission logic, return-trip bookings, or hotel-transfer upsells. Those are Phase 3 of the DB expansion plan and have their own pre-flight checklist there.
- **Do not** scrape or hot-link Giligetaway's API at runtime. The data we pull from them is a one-time seed; we do not depend on their service.
- If a step below seems ambiguous, stop and ask. Do not interpret silence as license.

---

## Phase G1 — Seed data refresh (immediate, low risk)

Goal: replace the speculative price points in `lib/seed-data.ts` with market-anchored values, and add a new dedicated demo operator that mirrors the Bali-mainland → Gili corridor at Giligetaway's published rates.

### G1.1 — Add a "Giligetaway-style" demo operator

Edit `lib/seed-data.ts`:

- Append one new operator to `OPERATORS`:
  ```ts
  {
    key: "samudra-jet",
    email: "samudra-jet@gilifast.local",
    companyName: "PT. SAMUDRA JET BALI",
    contactPerson: "Samudra Jet Bali",
    phoneNumber: "+62 361 234 5680",
  }
  ```
  Use a fictional name (`Samudra Jet`). Do **not** name it Giligetaway or any real competitor.

- Append two boats to `BOATS`:
  ```ts
  { reg: "SAMUDRA-JET-I",  name: "SAMUDRA JET I",  operatorKey: "samudra-jet", capacity: 80, description: "Serangan ↔ Gili corridor — morning departure." },
  { reg: "SAMUDRA-JET-II", name: "SAMUDRA JET II", operatorKey: "samudra-jet", capacity: 60, description: "Serangan ↔ Nusa Penida ↔ Gili Gede." },
  ```

- Append the schedules below to `SCHEDULES`. Prices are the **June 2026 publish-price** column from Giligetaway, in IDR per adult, oneway. (Net/agent pricing is intentionally not stored — see Phase 3 notes at the end of this doc.)

  | boatReg | origin | destination | time | duration (min) | price (IDR) |
  |---|---|---|---|---|---|
  | SAMUDRA-JET-I | Serangan | Gili Trawangan | 09:00 | 135 | 825000 |
  | SAMUDRA-JET-I | Serangan | Gili Air | 09:00 | 165 | 825000 |
  | SAMUDRA-JET-I | Serangan | Bangsal | 09:00 | 180 | 825000 |
  | SAMUDRA-JET-I | Gili Trawangan | Serangan | 11:30 | 165 | 825000 |
  | SAMUDRA-JET-I | Gili Air | Serangan | 11:45 | 150 | 825000 |
  | SAMUDRA-JET-I | Bangsal | Serangan | 12:00 | 135 | 825000 |
  | SAMUDRA-JET-II | Serangan | Nusa Penida | 10:30 | 60 | 450000 |
  | SAMUDRA-JET-II | Serangan | Gili Gede | 10:30 | 120 | 960000 |
  | SAMUDRA-JET-II | Nusa Penida | Gili Gede | 11:30 | 60 | 900000 |
  | SAMUDRA-JET-II | Gili Gede | Nusa Penida | 12:45 | 60 | 900000 |
  | SAMUDRA-JET-II | Gili Gede | Serangan | 12:45 | 120 | 960000 |
  | SAMUDRA-JET-II | Nusa Penida | Serangan | 13:45 | 60 | 450000 |

  These rows must be plain additions to the existing `SCHEDULES` array. Do not modify any existing row.

- Verify `seedRealData()` still upserts cleanly: the operator/boat lookup keys are unique, the schedule loop already handles arbitrary port pairs.

### G1.2 — Sanity-check existing Padang Bai prices

The existing seed has Padang Bai → Gili Trawangan at Rp385,000 (Eka Jaya) and Rp225,000–250,000 (Wijaya/Golden Queen/Ostina). These are the **net/agent** rates, not publish rates. Leave them as-is — they're correct for the operator's perspective and produce a believable price-shopping page when combined with the new Samudra Jet Rp825,000 publish-rate routes.

Document this in a single-line comment **above the `SCHEDULES` constant** in `lib/seed-data.ts`:
```ts
// Prices: Padang Bai operators store NET rates (their wholesale cost). Serangan
// (Samudra Jet) stores PUBLISH rates (rack rate). Both are correct because each
// operator sets its own pricing strategy; the search page just shows lowest first.
```

That's the only comment to add. Do not add per-row comments. Do not add a comment explaining why the source is Giligetaway — the source is not a stable reference and should not be documented in code.

### G1.3 — Run seed locally and confirm

```bash
pnpm db:push       # ensures schema is up to date
pnpm db:seed:real  # idempotent; safe to re-run
pnpm dev
# Visit http://localhost:3000 and search Serangan → Gili Trawangan on a future date
# Expect: Samudra Jet result at Rp825,000 in addition to existing Padang Bai operators
```

If no Serangan port appears in the search form's destination list, that's the gap Phase G2 (Port model) closes — don't patch it ad-hoc.

### G1.4 — Commit and stop

One commit. Message:
```
seed: add Serangan corridor operator with market-anchored June 2026 pricing
```

Do not start G2 in the same PR.

---

## Phase G2 — Port model groundwork (deferred to db-expansion-plan Phase 2)

The Port model is already designed in `docs/db-expansion-plan.md` Phase 2. The Giligetaway data confirms the port set we need:

**Authoritative port list** (10 entries — these are the canonical seed for the eventual `Port` table):

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

When the Port-model PR is opened (per `docs/db-expansion-plan.md`), seed these 10 rows verbatim. The `shortCode` column is new compared to that plan — add it as `@unique String @db.VarChar(3)` on `Port`. Justification: Giligetaway's API uses numeric IDs in URLs, which couples external callers to internal primary keys; a stable 3-letter code is friendlier and survives DB resets.

**Do not** open the Port-model PR as part of this synthesis. Just record the seed list and the `shortCode` addition so the Phase 2 PR has them ready.

Action for this synthesis: add a `## Port seed` section to `docs/db-expansion-plan.md` containing the table above, **only if the seed section does not already exist**. If it does, leave it alone. No other edits to that file.

---

## Phase G3 — Schedule day-of-week pattern (deferred, design only)

Giligetaway runs different schedules on Friday vs Mon/Wed/Sat. Our `Schedule` model has no concept of recurrence — we emit one Schedule per calendar date. That works for an operator entering their next 30 days by hand, but breaks when:

- a bulk import lands (CSV upload, third-party feed),
- an operator wants to say "run this departure every weekday".

Design (do not implement now):

- Add `daysOfWeek Int @default(127)` to `Schedule`. Bitmask: Sun=1, Mon=2, Tue=4, Wed=8, Thu=16, Fri=32, Sat=64. Default 127 = all days, which is backwards-compatible for every existing row.
- `lib/legs.ts` `generateLegsForSchedule` filters dates by `(1 << dayOfWeek) & daysOfWeek`.
- No UI change yet. Add it to operator-facing forms in a follow-up.

Record this in `docs/db-expansion-plan.md` Phase 2 — **append one bullet** under the existing Phase 2 list:

> - `Schedule.daysOfWeek Int @default(127)` — recurrence bitmask. Filter in `generateLegsForSchedule`. Needed for bulk import.

If a `Schedule.daysOfWeek` mention already exists in that file, do not add a duplicate.

---

## Phase G4 — Forward-looking notes (do NOT build)

These belong in Phase 3 of `docs/db-expansion-plan.md`. Recorded here only so the next planner knows what Giligetaway's data implies:

1. **Seasonal pricing.** Their corridor goes Rp825,000 → Rp850,000 for peak Jul–Aug. We can support this two ways:
   - **MVP-friendly:** operator creates per-date schedules with different prices. Already works. Tedious but correct.
   - **Future:** `PricingRule { id, scheduleId, validFrom, validUntil, priceOverride BigInt }`. Don't build this until at least two real operators ask for it.

2. **Publish vs agent price.** When the B2B API lands (Phase 3), add `Operator.commissionRate Decimal? @db.Decimal(5,4)` (e.g. `0.2000` for 20%). Compute `netPrice = round(publishPrice * (1 - commissionRate))` at query time. Do not store both prices. Per-tier commission (`AgentTier`) is a Phase 3+ concern.

3. **Return trips.** Giligetaway prices return as exactly 2× oneway, which means it's a UX convenience, not a separate product. When we add it: create two `Booking` rows linked by `returnBookingId String?`, no schema discount logic. Already aligned with `lib/booking-engine.ts`.

4. **Hotel transfer upsell.** Giligetaway's booking accepts `transport_id`, `quantity`, `transport_type: pickup|dropoff`. Out of scope for Gilifast MVP. If it ever lands: separate `BookingExtra` table with a polymorphic `type` enum. Do not bake it into `Booking`.

5. **Passport / nationality at booking.** Already supported via `Passenger.passportId` and `nationality`. Keep them required for cross-island routes; relaxing them is a separate decision.

None of this becomes work until Phase 3 of the DB expansion plan opens. **Do not pre-implement any of it during G1–G3.**

---

## Verification checklist

After G1 ships, the next session can confirm:

1. `pnpm db:seed:real` runs idempotently twice with no errors.
2. `prisma studio` shows a `samudra-jet` Operator with two Boats and 12 Schedules.
3. Customer search Serangan → Gili Trawangan on a future date returns a Samudra Jet result at Rp825,000.
4. Customer search Padang Bai → Gili Trawangan still returns the existing Eka Jaya / Wijaya / etc. results unchanged.
5. `pnpm lint && pnpm typecheck` clean.
6. `pnpm test:e2e` (when the suite exists) still green.
7. `docs/db-expansion-plan.md` mentions the Port seed list and the `daysOfWeek` bullet, if and only if those weren't already there.

If any of 1–6 fail, the seed data is wrong — fix the data, not the schema. Schema changes are out of scope for this phase.

---

## Out of scope (explicit)

To save the next model a round of "is this allowed?":

- New Prisma models, new tables, new columns on existing tables.
- B2B / agent / API key authentication of any kind.
- Adding Giligetaway as a runtime data source (no fetch, no proxy, no cache).
- New top-level libraries.
- Changes to `lib/refunds.ts`, `lib/pricing.ts`, `lib/booking-engine.ts`, `lib/auth.ts`.
- Any work in `app/admin/**`, `app/operator/**`, `app/api/**`.
- UI work — homepage, search form, ticket page, etc.
- Renaming or relocating existing seed data.
- Test infrastructure changes (Playwright config, new specs).
- CI / GitHub Actions changes.

If something looks like it would be "nice while I'm here," it is out of scope.

---

## Summary

| Phase | What | Status |
|---|---|---|
| G1 | Add Samudra Jet operator + 12 schedules to `lib/seed-data.ts` at Giligetaway publish-rate pricing. One commit. | **Do now** |
| G2 | Port seed list + `shortCode` column noted in `docs/db-expansion-plan.md`. No code. | Doc-only |
| G3 | `Schedule.daysOfWeek` bitmask noted in `docs/db-expansion-plan.md` Phase 2. No code. | Doc-only |
| G4 | Seasonal pricing, commission, return trips, transfers — implications recorded here, not built. | Awareness only |

End of plan.
