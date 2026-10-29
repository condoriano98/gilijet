# Prod issue: round-trip price is just 2 x the one-way price

**Created:** 2026-10-29
**Status (2026-10-29):** code, unit tests and e2e done on `staging`, **not committed, not deployed**. E2E ran against the staging database (project ref `asymnwikxyhipoezoggp`, the ref in `.env.staging`), with the live payment/messaging keys blanked. No production data was read or written. Open questions were taken at the recommended defaults (see below). A read-only production check was run on 2026-10-29 at the owner's request (see QC log).
**Reported:** in production, a round trip costs the same as two one-way tickets. The operator price sheet has a separate, cheaper return fare.

## Root cause

Not a regression: it is a recorded scope decision that is now wrong for the business.

- `Schedule.fareMatrix` stores `[oneWay|return][low|high|peak][adult|child|infant]` (`src/features/pricing/fares.ts`). The `return` row is imported from the operator price sheet (`src/features/schedules/wahana-schedule.ts`).
- `categoryFaresFor` reads only `matrix.oneWay` ("Booking is one-way only"). Nothing reads `matrix.return`.
- `engine.ts` (`createRoundTripBooking`, ~l.255-370) prices each leg on its own with `legPricingInputs` and sums them. The book page does the same (`totalUnitPrice = outbound + return`).
- `docs/spikes/done/SEASONAL_PRICING_ANALYSIS.md`, Decisions 7: "Round trip keeps using the `oneWay` cell per leg; the `return` cell is out of scope."

## Size of the gap (Wahana import, adult cells)

All 87 compared cells (29 fare blocks x low/high/peak): the return fare is **2.2% to 5.0% below** 2 x one-way. Example: low 450.000 one way, 880.000 return, we charge 900.000. Customers are overcharged by that margin on every round trip, on top of the display being wrong. Child and infant cells have a `return` value too. Not yet compared.

## Is it fixable? Yes, and without a schema change

Only the fare resolver needs to know the trip kind. Money still goes through `computeBookingPriceWithTypes` with `categoryUnitPrices`, which already takes absolute per-type fares, so commission, service fee, promo split and the `commission + operator = total` invariant are untouched. `Booking` keeps one `totalAmount`, and `seasonSnapshot` keeps one entry per leg, so refunds, notifications and manifests need no change.

### Recommended design: each leg is charged half of the return cell of its own season

- `resolveLegFares(leg, season, tripKind)`: for `ROUND_TRIP` read `matrix.return[season].<category> / 2` instead of `matrix.oneWay`.
- Same season both ways: the two legs add up to exactly the operator's return fare.
- Mixed seasons (HIGH out, PEAK back): the sheet does not define this. Half of each leg's own season cell gives the average of the two. **Needs operator confirmation.**
- Stays in `src/features/pricing/seasons.ts` (`legPricingInputs` gets an optional `tripKind`), so the single-source rule holds. Callers that pass a round trip: `engine.ts`, the book page, `roundTripBreakdown` inputs, the round-trip email (`adultFareFromSnapshot`, which needs the booking's `tripType`), and the search round-trip selector.
- Existing bookings are not recalculated (Decisions 6 of the seasonal doc still holds).
- Rounding: halves of whole-rupiah cells; use Decimal and round to 0 dp, assign any odd rupiah to the outbound leg so the sum equals the return cell.

### Alternatives considered

- **Discount line on the booking** (return = 2 x one-way minus a discount): needs a new column and breaks the "price comes from the sheet" property. Rejected.
- **Price the pair as one unit with one season** (e.g. outbound season): simple, but breaks the per-leg commission/refund/snapshot model, and a cancelled single leg then has no price. Rejected.

## Open questions (implemented at the recommended default; still to be confirmed)

1. Mixed-season pair: average of half cells (recommended), or one rule from the operator (e.g. season of the outbound day)?
2. Leg with `priceOverridden = true` (super admin hand-set price): keep its hand-set price with no return discount (recommended), or apply the ratio?
3. Return leg on a different schedule than the outbound (other direction, own matrix): use that schedule's own `return` cell (recommended), or only the outbound schedule's?
4. Schedules with no `fareMatrix` (only `basePrice`): stay at 2 x one-way, no change. Is that acceptable? Check in production how many active schedules have no matrix. That is a read-only query; it needs the owner's go-ahead because it is production.
5. Search page: the round-trip selector lists legs one by one at the one-way price. Show the return-adjusted price per leg, or keep one-way there and show the pair total only on the book page?
6. Customers already booked at 2 x: leave as is, or refund the 2-5% difference? A business call; not part of the code change.

## Plan (after "implement")

1. Add `tripKind` to the resolver and callers listed above.
2. Unit tests (`tests/unit/`): same-season pair equals the return cell; mixed seasons; override leg; no matrix; child and infant; odd-rupiah split; promo on a round trip keeps `commission + operator = total`; one-way is unchanged.
3. E2E (`tests/e2e/`): a round trip on a self-built fixture schedule with a `fareMatrix`, asserting the Outbound / Return / Total on the book page and the stored `totalAmount`. It builds and deletes its own fixtures.
4. QC on `pnpm dev`, recorded below. Staging check with the mock payment before anything goes near `main`.
5. Docs: the seasonal-pricing analysis gets a dated note that Decisions 7 is superseded; `CHANGELOG.md`; `package.json` PATCH bump (fix, rule 8). Comment in `fares.ts` ("Nothing here is charged yet") is already out of date and gets corrected.
6. Release via the normal `staging` -> `main` PR. Production is not touched until asked.

## Checklist

- [~] Open questions: built on the recommended default of 1, 2, 3 and 5; 4 (schedules without a matrix in production) and 6 (past bookings) still open
- [x] Resolver + callers (`fares.ts` `roundTripLegFaresFor`, `seasons.ts` `role`, engine, book page, search page, round-trip email)
- [x] Unit tests
- [x] E2E (`round-trip-booking.spec.ts`: fixture has a real return row, plus a new search test)
- [x] Dev-server QC via the Playwright run, screenshot of the book form viewed (no hand-driven browser session)
- [x] Docs, CHANGELOG, version (1.10.2)
- [ ] Staging verified
- [ ] Released

## QC log

| Date | Check | How | Result |
|---|---|---|---|
| 2026-10-29 | Unit: resolver | `vitest run tests/unit/features/pricing/seasons.test.ts`: one-way unchanged, same-season pair equals the return fare in LOW/HIGH/PEAK, child and infant, mixed seasons, odd rupiah, hand-set price, no matrix, OFF, no calendar row, `withSeasonPrice`, email fare | pass |
| 2026-10-29 | Unit: engine | `engine-round-trip.test.ts`: round trip asks for `OUTBOUND` then `RETURN` and never the one-way row; one-way never asks for the return row | pass |
| 2026-10-29 | Full suite, lint, typecheck | `vitest run`, `pnpm lint`, `pnpm typecheck` | 88 files pass; 0 lint errors (1 warning that predates this); typecheck clean |

| 2026-10-29 | E2E, round trip | `playwright test tests/e2e/round-trip-booking.spec.ts --project=chromium` against the dev server and the staging DB, `DOKU_*`, `PAYPAL_*`, `WHATSAPP_ACCESS_TOKEN`, `SMTP_PASSWORD`, `INBOX_IMAP_PASSWORD` blanked. Fixture routes with one way 150.000 / 200.000 and return fare 290.000 / 390.000. Search: one way shows Rp 150.000 and no Rp 145.000; round trip shows Rp 145.000 and Rp 195.000, no Rp 150.000, selected total Rp 340.000. Book form (adult + child): Outbound Rp 217.500, Return Rp 292.500, Total Rp 510.000, Pay Rp 510.000; mock payment; `booking.totalAmount` = 510.000, `tripType` ROUND_TRIP, 2 snapshot entries | 2 passed; screenshot viewed |
| 2026-10-29 | E2E regression | same setup: `seasonal-pricing`, `seasonal-booking`, `reschedule-season`, `customer-booking`, `admin-seasons` and `round-trip-booking` together | 18 passed |
| 2026-10-29 | Fixture cleanup | read-only count on the staging DB after the runs: schedules whose origin starts with `E2E`, bookings with an `@example.invalid` email | 0 and 0 |

| 2026-10-29 | Production data, read only | `.env.prod` opened at the owner's explicit request. One throwaway script (deleted afterwards) in a `SET TRANSACTION READ ONLY` transaction, `count` / `select` / `groupBy` only, aggregates printed, no customer data. Target project ref `viluiajknccclsogyogv`; the script aborts if the ref equals staging | Active schedules: 19, all PT Wahana Virendra Group, **19 with a valid matrix, 0 without, 0 invalid**. Adult + child cells (non-zero): 114, **all** with return < 2 x one-way, none equal or above, **none with return <= one-way** (no anomalies). Open future legs: 6080, all on a valid-matrix schedule, **0 hand-priced**. Bookings ever: 8 one-way, **1 round trip** (all statuses). Not obtained: paid round-trip count and active seasons (the script errored on a wrong enum value, `COMPLETED`, after the numbers above were printed) |

So open question 3 is moot today (every schedule has a matrix) and question 6 concerns at most one past booking.

Not checked: the round-trip confirmation email and boarding-pass mail with the new per-leg fares (unit-tested only; mail was blanked and mocked); real Wahana schedules and real seasons on staging or production; a hand-driven browser session beyond the Playwright run; the mixed-season case against the operator's expectation (unit-tested only); the full e2e suite (only the pricing and booking specs above ran). Local dev logs `QR_HMAC_SECRET` and `MCP_REVIEWER_TOKEN` shorter than 32 characters; that predates this work and did not affect these specs.

Known side effects to watch on first live check: the search results list shows the per-leg round-trip price when a return date is chosen, so an outbound card shows less than the same departure in a one-way search. `b/[reference]` "add a return trip" suggestions are still priced one-way.
