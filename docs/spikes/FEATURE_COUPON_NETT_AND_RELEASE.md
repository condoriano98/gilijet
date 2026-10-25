# Feature: Nett coupons, coupon release, targeting dropdowns

**Status (2026-10-25):** v1.11.0 and v1.12.0 are committed on branch `nth-coupon`, pushed to `origin/nth-coupon`, and v1.12.0 is tagged. **Not merged into `staging` or `main`, and neither migration (`2_…`, `3_…`) is applied to any database.** QC is partial: see "QC" for what ran and what could not.
**Version:** 1.11.0 (MINOR: new coupon type, new admin controls, new schema value), then 1.12.0 (MINOR: coupon rules changed, see below).

> **Where this page is out of date (2026-10-25, v1.12.0):** the Nett maths (children at the multipliers, `netFareForPassengers`), the "Per-customer limit and Budget cap stay" decision, the "every coupon needs a budget cap, max uses or max discount" rule and the open item about the homepage banner are superseded by "Update: v1.12.0" at the end of the page. The text above it is kept as the record of v1.11.0.

## Why

Review of the coupon module (2026-10-25) found that a coupon was never given back: an unpaid booking that expired, failed payment or was cancelled kept its use, its budget spend and its per-customer / first-booking redemption forever. The owner also wanted a "Nett" price type, no cost-bearer choice (Gilifast pays for everything), and routes / operators chosen from what exists instead of typed.

## Decisions (from the owner, 2026-10-25)

- **Release** the coupon when a booking expires or is cancelled.
- **Show the discount** on the payment page and in the emails.
- **Cost bearer removed** from the form: Gilifast absorbs every discount.
- **Nett (IDR)** type: the coupon value is the final price. Chosen basis: **per adult, per leg**; children and infants follow the traveler multipliers; the service fee is **added on top** of the nett price. _(Superseded 2026-10-25: Nett now prices every seat, see "Update: v1.12.0".)_
- **Routes** and **Operators** become checkbox dropdowns of what is live, each with an explicit **All** option (no blank field).
- **Per-customer limit** and **Budget cap** stay as they are for now; the owner is deciding whether to keep them (use cases explained in the chat, not changed here).

## What changed

| Area | Change |
|---|---|
| Schema | `DiscountType` gains `NET`; `Promotion.costBearer` defaults to `PLATFORM`. Migration `2_coupon_net_and_platform_cost` also moves existing coupons to `PLATFORM`. |
| Nett maths | `netFareForPassengers` in `pricing.ts`; `validatePromoCode` takes `passengerTypes`, `multipliers`, `legCount` and prices a `NET` coupon from them. `maxDiscountAmount` now caps percent **and** Nett. A Nett coupon that does not lower the fare is refused. |
| Release | `releasePromoRedemption(tx, bookingId, reason)` in `promotions.ts`: deletes the redemption, decrements `usedCount` and `budgetSpent`, writes an audit row. Called from `releaseBookingSeats` (expiry, payment failure, customer cancel, admin "operator unavailable"), from `cancelLeg`, and from the weather-cancel branch of the operator leg page. Idempotent. |
| Admin form | `coupon-form.ts` parses and validates the form (moved out of `actions.ts` so it can be unit-tested). `coupon-options.ts` lists live routes and active operators. New `shared/ui/multi-select.tsx`. Cost-bearer field and column removed. |
| Customer | `PromoCodeInput` sends the passengers and the departure to `/api/promos/validate`, so the preview applies the same route / operator / Nett rules. Payment page and `/b/[reference]` show price before promo, promo code and discount. "Payment received" and boarding-pass emails show the same rows. |
| Other | Homepage banner and MCP `list_coupons` word Nett coupons; `resolvePlatformPricing` ignores a `NET` service fee (the enum is shared). |

## Behaviour to know

- Every coupon now needs a budget cap, max uses or max discount, because every coupon is `PLATFORM`.
- With `PLATFORM`, the operator is paid as if there were no discount, so a Nett price below the operator's payout makes the platform commission negative. That is the intended subsidy; the budget / use caps bound it.
- A cancelled paid booking gives the coupon back in full even though the customer's refund follows the normal tiers.
- A round trip pays the nett price on each leg (`legCount: 2`); the discount is still split in half across the two legs by the engine.
- The booking keeps its `promotionId` and `discountAmount` after a release (history); only the redemption row and the counters go.

## Not done (still open)

- `getActivePromo` (homepage banner) does not skip archived, not-yet-started, exhausted or targeted coupons, so a private batch code can be shown publicly.
- `/api/promos/validate` has no rate limit; bulk codes use `Math.random()`.
- The unused `stackable` column is untouched (no longer written by the form).
- Pricing logic in `computeBookingPriceWithTypes` still has the OPERATOR / SHARED branches (tested, no longer reachable from coupons).
- Boarding-pass PDF and WhatsApp templates do not show the discount (WhatsApp templates are positional and approved by Meta).

## Tests

Unit (all in `tests/unit/`): `features/pricing/promotions.test.ts` (Nett maths, cap, refusals, `releasePromoRedemption`), `pricing.test.ts` (`netFareForPassengers`), `coupon-form.test.ts`, `coupon-options.test.ts`, `features/booking/release-booking-seats.test.ts`, `features/schedules/legs.test.ts` (coupon released on leg cancel), `engine-one-way` / `engine-round-trip` (passengers and `legCount` reach validation), `messaging/email.test.ts` (promo rows), `booking/notifications.test.ts` (coupon handed to the email), `shared/server/platform-config.test.ts`, `shared/ui/multi-select.test.ts` (form contract on first render).
E2E: `tests/e2e/coupon.spec.ts` (Nett booking through the form, status page rows, cancel gives the coupon back, route rule in the preview, owner-console form).

## QC

**Ran (2026-10-25, local, no database):**
- `npx tsc --noEmit`: clean.
- `npx eslint src tests`: clean.
- `npx vitest run`: 79 of 80 files, 1171 tests pass. The one failing file, `tests/unit/scripts/db-migrate-guard.test.ts`, fails on this Windows checkout before my changes (its target script `scripts/db-migrate-if-configured.mjs` has CRLF line endings after the shebang); I did not touch it.
- Migration SQL: generated with `prisma migrate diff` between the previous and new `schema.prisma` (no database), then the `UPDATE` appended by hand.

**Could not run:**
- **The migration was not applied to any database.** There is no Docker or local Postgres on this machine, and the rules forbid Supabase for `migrate dev`. It follows the precedent of `1_round_trip_and_seasonal_pricing` (`ALTER TYPE … ADD VALUE`). Run `pnpm db:migrate` against a local Postgres and read the result before this goes anywhere.
- **`tests/e2e/coupon.spec.ts` was written but never run** (needs the DB, `pnpm seed:qa` and mock payment keys). Its selectors and expectations are unverified. It also covers the status page, not the payment page: under mock payments `/pay/[reference]` redirects to the mock checkout, so the payment-page rows are verified by typecheck only.
- **No browser check of the dev server.** The dropdowns' toggling (All vs picks, falling back to All when the last pick is cleared, the popover opening in the form) and the layout of the new rows were not seen. Only the first-render form contract is unit-tested.
- Prisma's query-engine DLL could not be replaced by `prisma generate` (locked by another running node process); the generated types were updated, which is what typecheck and tests use.
- Emails were checked as rendered HTML in unit tests, not delivered.

## Docs updated (rule 7)

`CHANGELOG.md` (1.11.0, the old `[Unreleased]` note moved into it), `package.json`, `README.md` (source-of-truth table, layout), `STRUCTURE.md`, `CLAUDE.md` (coupons single source of truth), `src/features/diagnostics/feature-catalog.ts` (console coupons entry), `docs/spikes/TESTING_PLAN.md` (dated note on the cost-bearer line; the rest is historical and left as is), this file.

## Update: v1.12.0 (owner's second round, 2026-10-25)

### Decisions

- **Nett prices every seat, not only adults; Percent and Flat work on seat fares too (owner, third message).** The coupon value replaces the listed fare of each passenger who needs a seat (adult and child) on each leg, at that departure's own child fare (its `fareMatrix`, or the Pricing console multipliers for a leg without a matrix); a seat already cheaper than the nett price is left alone. Percent is a % of the adult and child fares, Flat is an IDR amount off them (never more than they cost). An infant on a lap is never discounted. This replaces both v1.11.0 ("children follow the multipliers") and the first v1.12.0 reading ("Nett replaces only the adult fare"). The "child 50%" is a default of the Pricing console, not a coupon rule.
- **Infants are free on some fast boats** because they sit on a parent's lap and need no seat. Recorded in README "Passenger categories and fares". An infant fare of 0 is a normal setting, and infants are never counted in `seatCount`.
- **Budget cap and Per-customer limit are removed.** "Max total uses" (quota) is the only cap and is now required: when the quota is used up the coupon is refused, for everyone. Gilifast pays for every coupon, so a coupon with no quota has no bound; a max discount alone caps one use, not the number of uses.
- **First booking only** recognises a buyer by account, email **or** phone: one use per buyer, and a buyer who has booked before is turned away. Other people using the code never block a buyer who has not booked; only the quota does. (Read from "apabila Max total uses digunakan oleh orang lain maka akan tetap bisa selama orang tersebut belum pernah pesan" as: other buyers using it do not count against you while quota remains. It was not read as "the quota stops mattering", which would defeat the quota.)
- **"Not valid coupon" pop-up** on the booking page when a first-booking-only code meets a buyer who has booked before: X at the top right, or closes by itself after 2 seconds.
- **No default coupon code.** The homepage banner shows only a coupon the owner created and that anyone could use now.

### What changed

| Area | Change |
|---|---|
| Seat fares | `passengerFare` and `seatFaresForLeg` in `pricing.ts` (the one place a category fare is worked out; `computeBookingPriceWithTypes` uses it too) list the fares of the adults and children of a leg. `PromoContext.seatFares` carries them for every leg: the engine builds it from `legPricingInputs`, the preview endpoint the same way. `validatePromoCode` takes Percent and Flat from their sum and prices Nett with `netDiscountForSeats` (per seat `max(0, fare - nett)`). Without `seatFares` Percent and Flat fall back to the whole fare and Nett is refused. |
| Budget / per-customer | Removed from `coupon-form.ts`, `validatePromoCode`, `applyPromoCode`, `releasePromoRedemption`, the form, the coupon list (Budget column, "Budget spent" status), the coupon page and MCP `list_coupons`. The columns `Promotion.perCustomerLimit`, `budgetCap`, `budgetSpent` stay in the schema, unused. |
| Quota | `maxUses` is required by `couponSchema` and the field. |
| Buyer identity | `src/shared/lib/phone.ts` `phoneKey` (digits, `+620…` read as `+62…`). `PromotionRedemption.customerPhone` (migration `3_coupon_redemption_phone`, with a backfill from the booking). `validatePromoCode` asks `hasBookedBefore` (account, email via Prisma; phone via one raw query that reduces `Booking.customerPhone` the same way). `applyPromoCode` re-checks, under the promotion row lock, that no redemption of the code has the same email or phone. |
| Reason code | `validatePromoCode` returns `reason: 'FIRST_BOOKING_USED'` with the text `Not valid coupon` (`NOT_VALID_COUPON`); the engine uses the same text when the lock-time check fails. |
| Preview | `/api/promos/validate` takes `returnLegId`, `email` and `phone` (it no longer takes `legs`) and passes them on, and returns `reason`. |
| Booking page | `PromoCodeInput` reads `#customerEmail` and the phone field when it checks, shows the pop-up (the shared `Dialog`, whose X is at the top right, plus a 2 s timer) and asks again when the buyer leaves the email or phone field after the code was accepted. The placeholder is no longer a code. |
| Homepage banner | `getActivePromo` filters archived, not-started, expired, quota-used and route/operator-limited coupons. |

### Behaviour to know

- **Existing coupons:** one that was bounded only by a budget cap (no quota) keeps working but is now unbounded until someone sets "Max total uses"; the form will not save it without one. Worth a look at the coupon list before this ships: coupons with an empty "Usage" limit are the ones.
- **Preview is best effort for first-booking-only.** A buyer who has not typed an email or phone yet passes the preview; the booking engine decides at submit, and the booking page asks again when the email or phone field loses focus.
- **Phone matching** only knows the Indonesian trunk-0 case. A foreign number typed with a trunk 0 after its dial code would not match the same number typed without it.
- **A bulk-generated code can still reach the banner** if it is the newest untargeted coupon and has quota left. A "show on homepage" flag on the coupon is the proper fix; not done (schema and form change).
- **The homepage is cached for up to 10 minutes** (`revalidate = 600`), so an archived coupon can stay on the banner that long.
- The unused columns hold old data. Dropping them is a later, deliberate migration.

### Tests

Unit: `promotions.test.ts` (Nett per seat, the child at its own fare, per leg, cheaper seats left alone; Percent and Flat on seat fares with the infant left out; first booking by email, by phone, quota still honoured, preview without identity, apply-time check, redemption phone), `pricing.test.ts` (`passengerFare`, `seatFaresForLeg`, `netDiscountForSeats`, a free infant stays free), `coupon-form.test.ts` (quota required, budget and per-customer ignored), `shared/lib/phone.test.ts`, `schedules/home-data.test.ts` (`getActivePromo`: filters, quota-used skip, no built-in code), engine one-way and round-trip (seat fares and buyer identity reach validation), `release-booking-seats` and `legs` (release returns only the use).
E2E (`tests/e2e/coupon.spec.ts`, written, **not run**): Nett 100k on an adult 200k and a child 120k (both seats at 100k, saving 120k, total 200k), first-booking-only (a new buyer uses it, the same email gets the pop-up, the pop-up closes after 2 s and with the X, a new email on the same phone gets it, a new email and phone does not), owner form (no budget or per-customer field, quota required).

### QC

**Ran (2026-10-25, local, no database):**
- `npx tsc --noEmit`: clean. `npx tsc -p tests/e2e/tsconfig.json`: clean apart from the `@next/env` complaint every spec already has.
- `npx eslint src tests`: clean.
- `npx vitest run`: 80 of 81 files pass; the one failing file is the same Windows CRLF one as before (`tests/unit/scripts/db-migrate-guard.test.ts`).

**Could not run, so unverified:**
- **Both migrations, and the raw SQL.** No Docker or local Postgres here. The phone lookup in `hasBookedBefore` is a `$queryRaw` (`"status"::text IN (…)`, `regexp_replace` on `"customerPhone"`) that no database has executed; the unit test checks the digits it is asked for, not the SQL. The backfill `UPDATE … FROM "Booking"` in migration 3 is also unrun. Run `pnpm db:migrate` against a local Postgres and exercise a first-booking-only coupon before this goes anywhere.
- **The e2e spec.** Selectors and the 2-second timing are unverified.
- **The pop-up in a browser.** The component has no unit test (the unit environment is plain Node, no DOM). I did not see it open, close on the X, close by itself, or re-check on blur.
- **The Prisma query engine DLL** could not be replaced by `prisma generate` (locked by another node process); the generated types did update.
- **`next build`** was not run.
- The banner was checked by unit test only, not on the running homepage.

### Docs updated (rule 7)

`CHANGELOG.md` (1.12.0), `package.json` (1.12.0), `README.md` (new "Passenger categories and fares", source-of-truth rows, layout), `STRUCTURE.md`, `CLAUDE.md` (coupons), `src/features/diagnostics/feature-catalog.ts`, the MCP `list_coupons` description, `prisma/schema.prisma` comments, this page. Historical docs that mention the removed fields (`TESTING_PLAN.md`, `SEASONAL_PRICING_ANALYSIS.md`) describe the multiplier defaults, which still exist, and are left as they are. The database reference PDF (`pnpm docs:db`) is not committed in this repo and could not be regenerated here (no Python).
