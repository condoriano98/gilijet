# Seasonal Pricing — Analysis & Plan

**Status:** Implemented (commit `8106454`, release **v1.1.0**), is on `origin/staging`, and the schema + RLS + seed have been applied to the staging DB (2026-10-13). Code QC is done and a manual check was performed (2026-10-14, local dev server + staging DB). Not in production yet. Confirmation on the deployed Vercel staging (`gilijet.vercel.app`) is still pending until the latest commit is pushed and deployed.
**Created:** 2026-09-28 · **Revised:** 2026-10-13
**Scope:** Wahana only (no other boats yet)

## Goal

Ticket prices are currently static. Prices must follow the season on the departure date: **LOW, HIGH, PEAK, OFF** (the UAC writes "MEDIUM" in some places; the season data uses HIGH, so the final enum = HIGH). Admins can manage the season data. No season data → fall back to the default price.

## Season data (from the business)

| Season | Start | End | Note |
|---|---|---|---|
| PEAK | 25 Dec | 25 Dec | |
| PEAK | 1 Jan | 2 Jan | |
| HIGH | 3 Jan | 31 Jan | |
| HIGH | 1 Dec | 31 Dec | |
| LOW | 1 Feb | 28 Feb | |
| LOW | 1 Mar | 31 Mar | |
| LOW | 1 Apr | 30 Apr | |
| OFF | 27 Mar | 27 Mar | Nyepi |

- May–Nov have no rows → fall back to default (LOW price / `basePrice`).
- Ranges may overlap (PEAK 25 Dec inside HIGH Dec; OFF 27 Mar inside LOW Mar).
- **Precedence:** OFF > PEAK > HIGH/LOW; if equal, the narrowest range wins.
- Dates are stored with the year (Nyepi shifts every year), not recurring.

## Decisions

1. **Per-season prices are stored in `Schedule.fareMatrix`**, not in the season table. The structure `[oneWay|return][low|high|peak][adult|child|infant]` already exists (`src/features/pricing/fares.ts`) and matches the season enum. The `Season` table is only a calendar: date → season type.
2. **`basePrice` = fallback.** A schedule without `fareMatrix` still uses the existing `basePrice` + passenger multiplier (season does not change the price). Currently only Wahana schedules have a `fareMatrix` (`scripts/import-wahana-schedule.ts`); that is enough for this scope. There is no `fareMatrix` editor in admin.
3. **Resolve at display & booking time** through a single resolver, not at leg generation time. Legs are only generated 60 days ahead (`BOOKING_HORIZON_DAYS`) and are idempotent, so a price written at generation time would go stale if the seasons change.
4. **OFF = unavailable**: the leg does not appear / cannot be booked.
5. **Manual override wins over season.** `adjustDeparturePrice` (super admin) marks `Leg.priceOverridden = true`; the resolver skips the season for that leg.
6. **Existing bookings are not recalculated.** The price is already snapshotted as `totalAmount` when the booking is created; `Booking.seasonSnapshot` (Json) records the season used for audit.
7. **Round trip** keeps using the `oneWay` cell per leg (current behaviour); the `return` cell is out of scope.

## Current state of the code

| Area | Location |
|---|---|
| Pricing engine | `src/features/pricing/pricing.ts` — `computeBookingPriceWithTypes({ unitPrice, … categoryUnitPrices })` |
| Booking | `src/features/booking/engine.ts` — `leg.basePrice` is used at ~165, 192 (one-way) and ~284, 291, 324, 335 (round trip); only the total is stored on `Booking` |
| Fare matrix | `src/features/pricing/fares.ts` — `categoryFaresFor()` hard-coded to `oneWay.low` ("no season resolver") |
| Leg | `src/features/schedules/legs.ts` — `generateLegsForSchedule` copies `schedule.basePrice` |
| Admin override | `src/app/admin/(authed)/operations/actions.ts` — `adjustDeparturePrice` |
| Timezone | `src/shared/lib/datetime.ts` — `ymdInZone()` (WITA) |

When this document was written there were no migrations (`prisma db push`) and no RLS/SQL in the repo; since 2026-10-14 the schema is Prisma migrations (see `VERSIONING.md`). Auth is custom (JWT), Prisma uses a DB role.

### `basePrice` readers that must go through the resolver

So that the displayed price = the charged price:

- Search: `src/app/(customer)/[locale]/search/page.tsx` (maxPrice filter, sort, display), `_components/round-trip-leg-selector.tsx`
- Book page: `book/[legId]/page.tsx` (duplicates the child/infant logic from the engine — remove the duplication)
- `b/[reference]/page.tsx`, `b/[reference]/reschedule/page.tsx`
- `src/features/booking/notifications.ts` (round-trip email; currently also ignores discount/child fare)
- `src/features/schedules/connection-search.ts`, `home-data.ts`, `src/mcp/tools.ts`
- POS: `src/app/operator/pos/page.tsx`, `pos-client.tsx`

## Implementation plan

1. **Schema:** `enum SeasonType { LOW HIGH PEAK OFF }`; `model Season { id, type, startDate @db.Date, endDate @db.Date, note?, isActive, createdAt, updatedAt, deletedAt? }` + index `(startDate, endDate)`; `Leg.priceOverridden`; `Booking.seasonSnapshot Json?`; `SEASON` in `AuditEntityType`.
2. **RLS (now in migration `1_round_trip_and_seasonal_pricing`, not `prisma/sql/`; the text below is the original plan):** `prisma/sql/season-rls.sql` (public `SELECT` only on active & not-deleted rows, no write policy). `db push` does not create policies, so it is applied manually **after** the push with `prisma db execute --file prisma/sql/season-rls.sql` using the target env. The Supabase MCP is *not* used: the staging project is not registered in the MCP. RLS only protects direct PostgREST access; "admin write" is enforced by `requireSuperAdmin` in the app.
3. **Resolver** `src/features/pricing/seasons.ts`: `resolveSeason` (pure), `getSeasonForDate` (query), batch loader for lists, `resolveLegFares`. Extend `categoryFaresFor(matrix, season)`. Date key = `ymdInZone(departureDate)`.
4. **Engine:** replace `leg.basePrice` with the resolver result; OFF → reject the booking; write `seasonSnapshot`.
5. **Override:** set `priceOverridden` in `adjustDeparturePrice`.
6. **Display:** all the readers above + a season badge in search results.
7. **Admin CRUD:** "Seasons" tab in `console/layout.tsx`, templated from `console/coupons/`; `requireAdmin`/`requireSuperAdmin` guard, Zod, `audit()`, soft-delete.
8. **Seed:** deterministic seasons in `scripts/seed-qa.ts` + 2026/27 seed from the table above.

## Acceptance Criteria (UAC) → verification

| UAC | How to verify |
|---|---|
| Season table created per the structure | migration `1_round_trip_and_seasonal_pricing` (`migrate deploy`) + schema check; no drift |
| RLS configured | Anon query: SELECT ok, INSERT/UPDATE/DELETE rejected |
| Frontend price changes per season | E2E: LOW/HIGH/PEAK/OFF dates, search price = book page = booking total |
| 25 Dec shows PEAK even though the month is HIGH | Unit `seasons.test.ts` + E2E |
| Nyepi (OFF) is unavailable | Unit + E2E: leg cannot be booked |
| Fallback without season data | Unit: May → default; schedule without `fareMatrix` → `basePrice` |
| No booking regression | `pnpm test:e2e`, `pnpm test:unit` (update the `tests/support/test-utils.ts` mock and engine tests) |

Unit test edge case: a 06:00 WITA departure falls on the previous UTC day (do not use UTC `getMonth()`/`getDate()`).

## Risks

- **Price consistency:** a missed `basePrice` reader will show a price different from the booking total. Mitigation: a single resolver + grep `basePrice` before merging.
- **Season change after bookings exist:** old bookings do not change (total snapshot); PENDING_PAYMENT holds are also not recalculated because the price is computed once when the booking is created.
- **N+1:** search/home lists must use the batch loader.
- **Yearly input:** per-year seasons must be entered by an admin every year (especially Nyepi).
- **Test mocks:** the new season query in the engine forces an update of the Prisma mock in tests.

## Implementation status (2026-10-13)

| Step | Status |
|---|---|
| 1. Schema (`Season`, `SeasonType`, `Leg.priceOverridden`, `Booking.seasonSnapshot`, `SEASON` audit) | Done, applied to staging |
| 2. RLS | Done, applied to staging (1 policy, RLS enabled) |
| 3. Resolver `src/features/pricing/seasons.ts` | Done (`resolveSeason`, `legPricingInputs`, `withSeasonPrice`, `adultFareFromSnapshot`) |
| 4. Engine: price from resolver, OFF → `LEG_CLOSED`, write `seasonSnapshot` | Done |
| 5. Override: `adjustDeparturePrice` sets `priceOverridden` | Done |
| 6. Display: search (+High/Peak badge), round-trip selector, book page, `b/[reference]`, reschedule, home, connection-search, POS, round-trip email | Done |
| 7. Admin CRUD `/admin/console/seasons` (super admin, soft-delete, audit) | Done, not yet tried in a browser |
| 8. Seed `pnpm seed:seasons` (8 rows 2026/27) | Done, seeded to staging |

Intentionally not changed: `src/mcp/tools.ts` and the admin/operator pages that show the raw `basePrice` (that is the leg's base price, not the customer price).

### Decisions taken during implementation

- Final enum **HIGH** (the UAC writes MEDIUM).
- Leg with a manual override on a `fareMatrix` schedule: child/infant price is now multiplier × override price (previously the matrix low cell).
- The round-trip email computes the per-leg price from the season in `seasonSnapshot`, not from the calendar at the time the email is sent.
- There is no season edit form: delete and re-add.
- Leg with a manual override: the badge and `seasonSnapshot` record `season: null` (its price does not come from the season), but OFF days still close sales.
- Wahana: the child fare in `fareMatrix` equals the adult fare (operator data, not a resolver bug).

### Verification

- **Unit:** 868 tests pass (`seasons.test.ts`: resolver, precedence, WITA day key, `withSeasonPrice`, `legPricingInputs`, `adultFareFromSnapshot`; one-way engine tests: OFF rejected, PEAK price, snapshot; tx mock updated).
- **New E2E, 9 tests pass:**
  - `tests/e2e/seasonal-pricing.spec.ts` (6): own fixtures in 2099 (schedule, leg, `Season`) and deleted again. No season, LOW, HIGH, PEAK wins over HIGH, manual override, OFF hidden and cannot be opened on the book page. Search = Total row on the book page. Does not create a booking.
  - `tests/e2e/admin-seasons.spec.ts` (3): `/admin/console/seasons` cannot be opened without login; super admin adds, rejected when end < start (validated by the server), deactivates, soft-delete + audit log; `adjustDeparturePrice` through the UI sets `priceOverridden` and the price in search follows while the neighbouring leg keeps following the season.
- **Engine QC against the staging DB** (temporary script, since deleted; 18 checks pass): one-way totals for no season/LOW/HIGH/PEAK/override match the manual calculation (adult+child+infant), payment amount = total and `PENDING_PAYMENT`, `seasonSnapshot` correct, OFF rejected with `LEG_CLOSED` without a booking row, round-trip HIGH+PEAK = 525.000 with 2 snapshot entries, round-trip with an OFF return rejected, old bookings unchanged when a season is deactivated, new bookings return to the normal price when a season is deactivated/soft-deleted. Test bookings and fixtures deleted; staging is clean.
- **Render sweep:** home, search (normal, round-trip, connection), reschedule, `/operator/pos`, `/operator/schedules` without errors.
- **Live on staging** (`/search` Padang Bai → Gili Trawangan): 1 Dec 2026 Rp 500.000 + High badge; 25 Dec Rp 700.000 + Peak badge; 27 Mar 2027 (Nyepi) no departures; 26 Mar Rp 450.000.
- **Not tested (deliberate):** successful payment, ticket issuance, boarding pass email/WA. The staging env uses **production** DOKU and PayPal (`*_IS_PRODUCTION="true"`) plus real WATI/Resend keys. For QC, all those keys were emptied in the dev server/script process (mock mode) and bookings were only created up to `PENDING_PAYMENT`.
- The old booking E2E tests (customer, round-trip, admin refund) have been skipped since before; the booking flow through to payment has not been E2E-tested.

### Manual check 2026-10-14 (done through an automated browser; screenshots viewed directly)

Local dev server with the latest code against the staging DB; DOKU, PayPal, WATI and Resend keys were emptied in the process, so checkout ran in mock mode ("TEST MODE", "Test card pre-filled — no real charge"). **The pay button was never clicked.** Not the deployed Vercel staging site.

| Flow | Result |
|---|---|
| `/search` HIGH and PEAK dates | "High season" / "Peak season" badge; per-person price Rp 150.000 / Rp 200.000; the "Book 2" button uses the season price |
| Booking form (1 adult + 1 child) | Breakdown per passenger type; total HIGH Rp 225.000, PEAK Rp 300.000; the "Pay Rp …" button equals the total |
| Form submit | Redirect to the payment page with the same total. `Booking` row `PENDING_PAYMENT`, `Payment` `PENDING` with the same amount, `seasonSnapshot` records the season |
| OFF date | No departures in search; the book page refuses ("no longer accepting bookings"); no booking row |
| `/admin/console/seasons` | The 8 seeded rows are shown, ordered by date, correct type badges; add-range form available |

Automation: `tests/e2e/seasonal-booking.spec.ts` (3 tests) repeats the form flow up to the payment page without paying; screenshots only with `QC_SHOTS=1`. The 2099 fixture was deleted afterwards (0 left on staging). Not tested: successful payment, sending real email/WA, mobile view.

### QC findings outside the season scope

- `/b/<reference>` for a ticketed booking errors in this env: `QR_HMAC_SECRET` < 32 characters (log `[env] Invalid or missing variables`), QR signing fails in `qr.ts`. Fix the secret in the staging env. As a result the return-leg suggestion view on that page has not been seen visually (its query ran without error before the crash).
- `operator-manifest.spec.ts` uses `waitForURL(/\/operator(\/|$)/)` which also matches `/operator/login`, so it can pass without actually logging in.
- The season price in POS was not visible during QC because there are no departures within 8 hours; the logic is the same as what was tested in the engine.

### Remaining

- Owner's manual check in the browser: booking flow up to the payment page (do not pay; DOKU/PayPal in this env are production), the Seasons tab view, the badge on search cards.
- ~~Customer reschedule does not yet reject a destination leg on an OFF day on the server~~ — done in v1.1.1: `submitRescheduleAction` uses `legPricingInputs(...).closed`. E2E: `tests/e2e/reschedule-season.spec.ts`.
- ~~`take` on departing-soon (home) and reschedule candidates is truncated before OFF legs are dropped~~ — done in v1.2.0: `take` removed, `.slice(limit)` after `withSeasonPrice`. Unit test in `home-data.test.ts`.
- Boats other than Wahana: need a `fareMatrix` (or a new decision, e.g. a multiplier) before seasons apply to them.
- The season calendar must be filled in by an admin every year (especially Nyepi); the seed only covers 2026/27.
- The column structure from the ticket attachment has not been seen; the `Season` columns are assumed from the data. Match them before prod.

### Deploy / prod

- (Replaced 2026-10-14: the build now runs `prisma migrate deploy` through `scripts/db-migrate-if-configured.mjs`; the production baseline has not been done.) Previously `pnpm build` ran `scripts/db-push-if-configured.mjs` (`prisma db push`, without `--accept-data-loss`) on every Vercel build using that build's env. Merging to the prod branch automatically applied this schema change to the prod DB (additive). Hold the merge until ready, or set `SKIP_DB_PUSH=1` in the prod env.
- Once the schema is in prod: RLS comes with migration `1_…`; `pnpm seed:seasons` with the prod env is still run deliberately (see `docs/RELEASING.md`).
- The local DB (`.env`, `.env.local`) and `.env.staging` point to the same Supabase project (staging), so `pnpm seed:qa` / `test:e2e` from a dev machine write to staging.
