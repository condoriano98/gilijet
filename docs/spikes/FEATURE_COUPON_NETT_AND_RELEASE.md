# Feature: Nett coupons, coupon release, targeting dropdowns

**Status (2026-10-25):** implemented on branch `nth-coupon` as v1.11.0, committed, **not pushed, not tagged, migration not applied anywhere**. QC is partial: see "QC" for what ran and what could not.
**Version:** 1.11.0 (MINOR: new coupon type, new admin controls, new schema value).

## Why

Review of the coupon module (2026-10-25) found that a coupon was never given back: an unpaid booking that expired, failed payment or was cancelled kept its use, its budget spend and its per-customer / first-booking redemption forever. The owner also wanted a "Nett" price type, no cost-bearer choice (Gilifast pays for everything), and routes / operators chosen from what exists instead of typed.

## Decisions (from the owner, 2026-10-25)

- **Release** the coupon when a booking expires or is cancelled.
- **Show the discount** on the payment page and in the emails.
- **Cost bearer removed** from the form: Gilifast absorbs every discount.
- **Nett (IDR)** type: the coupon value is the final price. Chosen basis: **per adult, per leg**; children and infants follow the traveler multipliers; the service fee is **added on top** of the nett price.
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
