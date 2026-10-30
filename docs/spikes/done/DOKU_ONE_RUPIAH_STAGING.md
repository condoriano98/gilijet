# Rp 1 departure on staging (live DOKU test)

**Update 2026-10-30:** moved to `done/`. The owner reports the Rp 1 DOKU test on staging is finished. The details were not recorded here (the redeploy and `APP_BASE_URL` check, the e2e against the deployed site, and the result of the Rp 1 payment), so the two unticked boxes below and the "Blocker" section describe the state of 2026-10-14. The environment variables on the Vercel `staging` environment were not re-read for this note.
**Status (2026-10-14):** staging is seeded (59 departures at Rp 1). **The live DOKU test is blocked**: the DOKU keys are not assigned to the Vercel `staging` environment, so the deployed site most likely shows the mock checkout. See "Blocker".

## Goal

Test the real DOKU payment path from staging without spending real money: **Padang Bai → Senggigi, Rp 1**, plus the way back **Senggigi → Padang Bai, Rp 1** so a round trip (Rp 1 + Rp 1 = **Rp 2** for one adult) can be tested too. The owner confirmed that DOKU on staging is the live account on purpose ("DOKU gapapa pakai prod"); Rp 1 keeps the amount that leaves a card or wallet negligible.

## Design

- **Round trip:** a second schedule on the same boat, Senggigi → Padang Bai at **12:00**, Rp 1, same rules. A round trip books the two departures, each priced from its own leg.
- **Where:** a new `Schedule` on the QA boat `QA-BOAT-001` (operator "QA Boats", from `pnpm seed:qa`), departing **07:00** daily (the way back at 12:00), `basePrice` 1, **`fareMatrix` null**, linked to the existing `Port` rows. The real Wahana schedules Padang Bai → Senggigi (08:30, 13:00, Rp 450.000, boat Cantika 09) and Senggigi → Padang Bai (11:15, 15:45) are not touched, and Wahana's manifests and reports do not see the Rp 1 sales. The schedule key is boat + origin + destination + time, so a different time (and boat) cannot collide with them.
- **Why no fare matrix:** `legPricingInputs` (`src/features/pricing/seasons.ts`) prices a leg from `leg.basePrice` when the schedule has no matrix, so the fare is Rp 1 in LOW, HIGH and PEAK alike (a closed OFF day still blocks sales). Unit-tested.
- **Amount sent to DOKU:** staging `PlatformConfig` has `serviceFeeValue = 0`, and the 8% commission of Rp 1 rounds to 0, so one adult is exactly Rp 1. Book **one adult only**: a child fare is 50% and would round.
- **Departures:** `generateLegsForSchedule` for 60 days (`BOOKING_HORIZON_DAYS`). The staging cron does not run (Vercel Cron is production-only), so re-run the script to top the window up.
- **Visibility:** anyone using the staging site can find this departure. Staging is `noindex`, but treat it as public to people who know the URL.

## DOKU limits (docs.doku.com, "requirements and limitations", read 2026-10-14)

| Method | Minimum |
|---|---|
| QRIS | Rp 1 (max Rp 10.000.000) |
| Mandiri VA, BRI VA | Rp 1 |
| BCA VA | Rp 10.000 |
| Credit card | Rp 1, some issuers only Rp 10.000 |
| e-wallet | Rp 10.000 (page lists it that way; another source says Rp 1) |

So pay Rp 1 with **QRIS or a Mandiri/BRI virtual account**. Not verified by me: that DOKU Checkout (as opposed to the direct APIs on that page) exposes exactly these channels for this merchant.

## Use

Seed or top up (writes to whatever `DATABASE_URL` points at; asks for the project ref):

```
set -a; source .env.staging; set +a
CONFIRM_PROJECT_REF=<staging project ref> pnpm seed:one-rupiah
CONFIRM_PROJECT_REF=<staging project ref> pnpm seed:one-rupiah --remove   # retire it
```

`--remove` marks the schedule inactive and deletes only departures with no bookings, holds, reschedules or check-ins; a booked departure is kept.

Run the hand-off test against the deployed staging site (opt-in, never part of `pnpm test:e2e`):

```
E2E_LIVE_DOKU=1 E2E_BASE_URL=https://<staging host> pnpm exec playwright test doku-one-rupiah
```

Two tests. One way: it searches Padang Bai → Senggigi, asserts the Rp 1 fare and a Rp 1 Pay button, books one adult, clicks Pay on `/pay/<ref>` and expects to land on a `doku.com` page. Round trip: outbound and return each Rp 1, total Rp 2, then the same hand-off. It stops there. Paying is manual. It fails if the environment shows the mock checkout ("TEST MODE"), which means the DOKU keys are missing there. The booking stays `PENDING_PAYMENT` and expires by itself.

## Blocker (found 2026-10-14)

Vercel has no fallback from a custom environment to Production: a variable reaches the `staging` environment only if `staging` is ticked on it. Read from the project's variable list (names and scopes only, no values):

- `DOKU_CLIENT_ID`, `DOKU_SECRET_KEY`, `DOKU_IS_PRODUCTION` (and `PAYPAL_*`) exist, scoped to **Production + Preview**, with no custom environment. The `staging` environment is not ticked on them.
- The `staging` environment holds only: `CRON_SECRET`, `QR_HMAC_SECRET`, `MIDTRANS_*` (4, legacy), `DATABASE_URL`, `DIRECT_URL`, plus `APP_BASE_URL`, `AUTH_SECRET`, `GOOGLE_OAUTH_*` that are shared with production.

So the deployed staging site most likely runs the mock checkout. Not proven: whether Vercel's "Preview" scope also reaches a custom environment. The evidence points to no (the database URLs needed their own `staging` entries next to the Preview+Production ones, and the filtered `staging` listing omits the DOKU keys); the definitive check is `/admin/diagnostics` on the staging site (DOKU mode) or the pay page showing a TEST MODE checkout.

**Fix (done 2026-10-14, see checklist; the notes below are how it was reasoned):** in Vercel → project `gilifast` → Settings → Environment Variables, tick `staging` on `DOKU_CLIENT_ID`, `DOKU_SECRET_KEY` and `DOKU_IS_PRODUCTION`, then redeploy `staging`. Do not tick it on `PAYPAL_*` (PayPal then stays off on staging). Also check `APP_BASE_URL`: it is listed for production (and the `staging` environment), and DOKU's `callback_url` is built from it; make sure it holds the staging address, not gilifast.com. Side note: the live DOKU and PayPal keys are also scoped to Preview, so a preview deployment of any other branch can reach them.

## Known limits and open points

- **Webhook:** DOKU has one notification URL per account in the Back Office. Where it points was not stated. If it points at production, a Rp 1 payment made from staging is not reported to staging, and the staging booking stays `PENDING_PAYMENT` after the money moved. Record what is observed; this spike does not change the Back Office.
- **Refund:** DOKU refunds are manual (`refund-gateway.ts` returns null). A Rp 1 payment is not worth refunding.
- **After payment:** a settled booking becomes `AWAITING_CONFIRMATION`; no ticket until an admin confirms (`/admin/confirmations`), as everywhere.
- **README** still says staging runs DOKU in mock mode and has no sandbox account. The staging database has `dokuMode = LIVE`, so that paragraph is at least partly outdated; whether the Vercel `staging` environment holds the live DOKU keys is part of the checklist and the README is corrected once known.

## Checklist

- [x] Seed script `scripts/seed-one-rupiah.ts` with project-ref guard (`scripts/lib/one-rupiah.ts`), `pnpm seed:one-rupiah`
- [x] Unit tests (`tests/unit/scripts/seed-one-rupiah.test.ts`, 7): ref parsing, guard, schedule definition, Rp 1 in LOW/HIGH/PEAK
- [x] Opt-in e2e `tests/e2e/doku-one-rupiah.spec.ts`; skips without `E2E_LIVE_DOKU=1` + `E2E_BASE_URL` (checked: skipped in the default run)
- [x] Seed staging (project `asymnwikxyhipoezoggp`, 2026-10-14): 1 schedule on QA-BOAT-001, 59 open departures, all Rp 1, 2026-10-15 to 2026-12-12, ports linked; Wahana schedules unchanged (08:30 / 13:00 still Rp 450.000 with their fare matrix)
- [x] Check Vercel variable scopes (names only): DOKU keys are Production+Preview, not `staging`; see Blocker
- [x] 2026-10-14, at the owner's request: three new `sensitive` variables created for the `staging` custom environment only (`DOKU_CLIENT_ID`, `DOKU_SECRET_KEY`, `DOKU_IS_PRODUCTION=true`), values from the owner's live DOKU account (not recorded here). The existing Production/Preview entries were not touched. They apply from the next `staging` deployment
- [x] Return schedule seeded on staging (project `asymnwikxyhipoezoggp`, 2026-10-14): Senggigi → Padang Bai 12:00, Rp 1, 59 open departures, ports linked; the 07:00 schedule unchanged (0 added, 59 open); the 4 Wahana Padang Bai ⇄ Senggigi rows still Rp 450.000
- [ ] Redeploy `staging`, confirm the DOKU mode on `/admin/diagnostics`, and check `APP_BASE_URL` (sensitive, cannot be read back; it must hold the staging address)
- [ ] Run the e2e against the deployed staging site; owner pays Rp 1; record whether the booking reaches `AWAITING_CONFIRMATION`

## QC

| Check | Result |
|---|---|
| `pnpm typecheck`, `pnpm lint` | Clean (1 old warning) |
| New unit tests | 6/6 |
| Default `playwright test doku-one-rupiah` | skipped, as intended |
| `seed:one-rupiah` on staging DB | Ran twice with the project ref; read back: 2 schedules (07:00 out, 12:00 back), 59 legs each, price 1, no fare matrix, ports linked, the 4 Wahana rows unchanged |
| Vercel variable names and scopes | DOKU keys not assigned to `staging` (Blocker); effect on the deployed site inferred, not observed |
| Deployed site search/booking, DOKU page, payment | **Not run** (blocked) |

## Status note 2026-10-24: Rp 2 legs on the Wahana boat (staging only, by hand)

Outside `pnpm seed:one-rupiah`, two Rp 2 schedules were added by hand on staging (project `asymnwikxyhipoezoggp`) on Cantika 09 (PT WAHANA VIRENDRA GROUP), `fareMatrix` null, every day, ports linked: Padang Bai → Senggigi 07:00 (165 min, id ends `4fkf0q`, legs 2026-10-24 to 2027-12-30) and, for a round trip on 1 Jan 2027, Senggigi → Padang Bai **13:00** (165 min, id `cmvmiqcyk0001q88qdkw2mxr1`, 365 legs, 2027-01-01 to 2027-12-31, via `generateLegsForSchedule`). They are real Wahana-boat rows, so the operator's manifests and reports see these sales; the real Wahana schedules were not touched. The nightly top-up does not run on staging (Vercel Cron is production-only): extend the window by hand if needed. Remove both before the production merge matters (they live only in the staging database).
