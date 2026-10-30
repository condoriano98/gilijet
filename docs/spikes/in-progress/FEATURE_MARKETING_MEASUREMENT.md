# Phase-one marketing measurement and performance dashboard (Google Ads + Meta)

**Update 2026-10-30:** stages 2 to 4 and the revision are committed (`0a1a8e1`, 2026-10-27) and, with stage 1 (`4373027`), are in `main` since PR #7. They are live in the build but every switch is off. Stage 5 (the dashboard) is still not started.
**Status (2026-10-26):** in progress on `claude/magical-curie-gi16o3`, which is based on `staging`. Stages 0–4 are written, plus the architecture revision of 2026-10-26: financial contract, attribution integrity, consent withdrawal, reconciliation. Stage 1 is committed (`4373027`); stages 2–4 and the revision are not committed. Stage 5 (the dashboard UI) needs the owner's approval before it starts. The design reference is now `docs/MARKETING_MEASUREMENT.md`. Nothing is deployed, and no live tag, API or ad account has been touched.
**Goal:** measure Google Ads and Meta Ads against the internal paid-booking ledger, with a SUPER_ADMIN-only dashboard at `/admin/marketing`. The booking/payment tables stay the authority for money. GA4 and the ad platforms are separate measurement sources and are expected to disagree with it.

Decisions the owner made (2026-10-26): GTM is the only browser tag owner; a minimal consent banner is built (default deny); the dashboard is SUPER_ADMIN only; all stages are delivered on this branch, with one commit per stage after the owner's go-ahead.

## What is true today (checked 2026-10-26)

| Brief assumed | Repository reality | What this work does |
|---|---|---|
| request → operator confirms → payment → ticket | `PENDING_PAYMENT` (booking created) → DOKU payment verified → `AWAITING_CONFIRMATION` → admin phones the operator and confirms at `/admin/confirmations` → `CONFIRMED` with tickets in the same transaction. A rejection gives `CANCELLED_BY_OPERATOR` plus a full refund row | Events follow the real order. `purchase` comes before `seat_confirmed`. "Confirmation-to-payment conversion" does not exist here, so the dashboard reports payment-to-confirmation and says so |
| request-sent timestamp | None. Operators are phoned | Response time = `availabilityDecidedAt − Payment.paidAt`, labelled as a proxy |
| passenger table | Passengers are JSON in `Booking.notes` | `passengerCount` = people on the booking (infants included), once per booking. `passenger_legs` = people × legs (2 for a round trip) |
| integer minor units | Money is `Decimal(12,2)` IDR | Kept as Decimal. `src/features/marketing/money.ts` converts for platform payloads |
| tax / fee columns | No tax exists. The service fee is folded into `totalAmount` and `commissionAmount` | Gross booking value = `Booking.totalAmount` |
| operator settlement ledger | None. `operatorAmount` is never adjusted after a refund | Refunds are shown separately. Retained revenue after refunds is labelled as an assumption (see the formulas in `docs/MARKETING_MEASUREMENT.md`) |
| multiple refunds per booking | `Refund.bookingId` is unique, and nothing sets `COMPLETED`. DOKU refunds are manual | `refund` fires when an admin marks the refund completed (added in stage 2). One refund per booking is a stated limitation |
| analytics, consent, attribution | None. The privacy page says "essential cookies only, no third-party advertising trackers" | Built in stages 1–3. The privacy page is rewritten in stage 3 |
| charts, tabs, date-range picker | None, and CLAUDE.md forbids new UI libraries | Hand-rolled SVG and `<nav>` tabs |
| Jakarta reporting timezone | Only WITA (`Asia/Makassar`) exists | `REPORT_TIMEZONE`, default `Asia/Jakarta` |
| crons everywhere | Vercel crons run on Production only | Staging calls the new crons by hand with `CRON_SECRET` |

Other findings:
- `recordPaymentAwaitingConfirmation` read the status, then updated it. Two concurrent DOKU callbacks under READ COMMITTED could both pass the check. Stage 2 turns it into a conditional `updateMany` on `PENDING_PAYMENT`.
- A DOKU success that arrives after a booking has expired or been cancelled is acknowledged as `alreadyRecorded` and nothing else happens: money is received and no one is told. Stage 5 lists it under Exceptions as an unmatched payment. No purchase is recorded for it.
- CLAUDE.md says Next 14. The repo is Next 16.3.2 (`proxy.ts`, async request APIs). The CLAUDE.md fix is in stage 7.
- `CRON_SECRET` was missing from `.env.example`. Added in stage 1.

## Provider facts used (official docs, checked 2026-10-26)

- **DOKU Checkout notification:** fields `order.invoice_number`, `order.amount` (IDR, no decimals), `transaction.status` and `transaction.date`. **No currency field.** The signature scheme matches `verifyDokuNotification`. DOKU documents **no timestamp tolerance**. It retries 3 times (about 30 min, 6 h and 12 h), and the Back Office can resend by hand. A time window would therefore reject legitimate retries, so none is enforced. Idempotency is the guard. For Checkout, DOKU says to ignore `FAILED` (the customer can switch method), so `payment_failed` is an attempt-level diagnostic only. No EXPIRED notification is documented. Hosted pages run on `sandbox.doku.com` (sandbox) and `jokul.doku.com` (production JS). The production `payment.url` host still has to be confirmed on a live redirect.
- **Google Ads:** `UploadClickConversions` is closed to new integrations since 2026-06-15 (`CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`). Google points to the **Data Manager API** (`POST https://datamanager.googleapis.com/v1/events:ingest`, scope `datamanager`, numeric conversion action id as `productDestinationId`). Developer tokens were retired on 2026-09-09. Reporting uses Google Ads API **v26** `googleAds:searchStream` with OAuth, plus `login-customer-id` for MCC access.
- **GA4 Measurement Protocol:** `client_id` is required, and the raw `_ga` value has been accepted since 2026-02-17. Include `session_id` within 24 h of session start to inherit attribution. `timestamp_micros` reaches back at most 72 h. Purchase needs `transaction_id`, `items`, and `currency` whenever `value` is set. The consent fields are `ad_user_data` and `ad_personalization`.
- **Meta:** Graph/Marketing API **v26.0**. CAPI website events require `client_user_agent`, `action_source`, `event_source_url` and `event_time` (at most 7 days old, or the whole request fails). Pixel/CAPI deduplicate on matching `event_name` + `event_id` within 48 h. `fbc` = `fb.1.<ms>.<fbclid>`. Insights: `action_report_time` and `use_unified_attribution_setting` have been ignored since 2025-06-10, and figures can change for up to 28 days.
- **Consent Mode v2:** the `gtag('consent','default',…)` call must run before GTM loads.

## Stages and checklist

- [x] 0. Discovery. Rebased on `staging` (the trees of `staging` and `main` are identical; `main` only adds merge commits), dependencies installed, Next 16 docs read (`next/script`, `after`, `cookies`), provider docs checked (above).
- [x] 1. Contract and schema: `src/features/marketing/{contract,consent,privacy,attribution,money,config,events}.ts`, migration `2_marketing_measurement` (6 tables with RLS enabled and no policies), env switches.
- [x] 2. Verified payment events and outbox delivery:
  - **Lifecycle events** are recorded inside the transition's own transaction, under a savepoint: `booking_request_created` (engine), `purchase` (`recordPaymentAwaitingConfirmation`), `seat_confirmed` + `ticket_issued` (`issueTicketsForBooking`), and `booking_cancelled` (operator reject, customer cancel, leg cancel, weather cancel, hold expiry, payment-setup failure). `begin_checkout` is recorded after the DOKU/PayPal session is created. `payment_failed` is keyed on the gateway attempt id.
  - **Refunds:** a new "Mark money returned" action on `/admin/refunds` moves APPROVED/PROCESSING to COMPLETED and records `refund`.
  - **Race fix:** `recordPaymentAwaitingConfirmation`, `issueTicketsForBooking` and `rejectBookingAvailability` now use a conditional `updateMany`, which closes the concurrent-callback race.
  - **DOKU checks:** currency is checked. A verified payment on an expired or cancelled booking returns `unmatched_late_payment` and records no purchase.
  - **Outbox:** `src/features/marketing/delivery/` holds GA4 Measurement Protocol (purchase, refund), Meta CAPI (Purchase) and Google Data Manager (purchase).
    - Every delivery is gated on consent, configuration, match data and provider age limits. Skips are recorded with a reason.
    - Off-production runs use the GA4 debug endpoint, the Meta `test_event_code` and Data Manager `validateOnly`.
    - Retries back off at 2–32 minutes over 6 attempts. Errors are scrubbed of tokens. Admin replay is available.
    - Match-data retention purge.
    - New cron `/api/cron/marketing-deliver` (every 5 min on Production), plus an `afterResponse` kick after each purchase.
- [x] 3. GTM, consent banner, attribution capture, privacy page:
  - **`MarketingTags`** is in the customer layout only, and renders nothing unless `NEXT_PUBLIC_GTM_ID` is valid or events are enabled. A single inline script sets the Consent Mode defaults (all denied), applies the stored choice, and only then requests `gtm.js`.
  - **Consent banner** offers Accept all, Essential only or Choose, in en/id/zh/ja. Its "Cookie settings" footer link reopens it.
  - **Runtime:** one sanitized `page_view` per real navigation, carrying `page_location`/`page_referrer` with booking references masked and click ids kept for GA4. Attribution is captured into the `gf_attr` cookie only with consent. A landing seen before the choice is held in memory and applied if the visitor accepts.
  - **Events:** `search` (search page), `view_item` (book page) and the browser `purchase` (booking page) are pushed only after the backend has recorded the verified purchase. The browser purchase reuses its event id.
  - **Collect endpoint:** public `POST /api/marketing/collect`, consent-gated, strict schema, PII check, size and rate limits.
  - **Booking snapshot:** `BookingAttribution` is written at booking creation from the visitor's cookies, by both the book page action and `/api/bookings`.
  - **Privacy page:** cookies, sharing and retention sections rewritten (owner/legal review needed; see the open items).
- [x] Revision (2026-10-26), driven by the owner's architecture brief:
  - **Financial contract:** Decimal-only, with provenance (actual/estimated/unknown), in `reporting/{measured,financials,metrics}.ts`.
    - GMV is never revenue.
    - Commission is expected at payment and earned only on fulfilment or forfeit.
    - A partial refund is unknown with bounds, never prorated.
    - An unrecorded DOKU fee is unknown, not 0.
  - **Contribution metrics:** paid and fulfilled CPA, commission/contribution ROAS, net marketing contribution, payment-to-fulfilment rate, refund rate by count and by value, contribution per fulfilled booking. Zero denominators and partial inputs are explicit.
  - **Attribution:** `unknown` is now separate from `direct`. "Direct" needs a recorded direct visit; a booking with no evidence was previously classed direct. Channel groups: attributed paid, attributed non-paid, direct, unknown, consent unavailable.
  - **Consent withdrawal after booking:** new `BookingAttribution.consentWithdrawnAt`. The banner endpoint `/api/marketing/consent` and the admin endpoint wipe matching identifiers and skip queued sends, and the dispatcher re-checks effective consent before every send and replay.
  - **Delivery reclaim:** a stuck delivery is reclaimed by compare-and-set on `lastAttemptAt`. Previously two workers could both reclaim the same stuck row.
  - **`unmatched_late_payment`:** recorded as an internal event, for DOKU and PayPal.
  - **Reconciliation:** read-only, in `reporting/reconciliation.ts`, plus the explicit audited repair, which records only missing marketing events.
- [x] 4. Ad spend ingestion:
  - **Google Ads** v26 `searchStream` at campaign level.
  - **Meta** v26.0 Insights at ad level, with reach stored apart.
  - **CSV** template and import.
  - **Ingestion:** replace-by-grain per account-day, with guards against an incomplete or empty response erasing data, and `AdSyncRun` reports.
  - **Routes:** optional `MarketingCampaignRouteMapping` with direct, allocated (estimate) and unallocated buckets.
  - **Time models:** period vs cohort.
  - **Data access:** dashboard contracts and read-only loaders.
  - **Crons and APIs:** `/api/cron/ads-sync` (daily, off by default) and SUPER_ADMIN APIs under `/api/admin/marketing/*`.
  - **Migration:** `3_marketing_reconciliation_and_spend_grain`.
- [ ] 5. Dashboard.
- [ ] 6. Reconciliation tests and e2e.
- [ ] 7. Docs and release (1.11.0).

## Migration notes

`2_marketing_measurement` is additive: it creates 6 tables and 6 enums and changes nothing existing. The SQL was generated with `prisma migrate diff --from-schema-datamodel <staging schema> --to-schema-datamodel prisma/schema.prisma`, which needs no database. RLS lines were added by hand, following the `OperatorPicContact` convention. CI's `migrations` job applies it to Postgres 16 and checks for drift.

Rollback before data matters: a new migration that drops the six tables and enums. Once data exists, switch off with the env flags instead; the tables can stay.

## Production notes (2026-10-27)

**Update 2026-10-30:** the PR `staging` → `main` these notes prepare for has been merged (PR #7, `70aabaa`, 2026-10-30 00:14 +0700), so the two migrations and the two crons are in the production build. The notes below are the pre-merge plan, not rewritten. Not checked here: the production build log (`[db-migrate] OK`), that the switches are still off, and the `mobile-layout.spec.ts:64` question.

Merged into `staging` and pushed on 2026-10-27 (`0a1a8e1`). **Production is not touched and nothing here is released.** Before the PR `staging` → `main`:

- **The migrations run on the production build.** The production build runs `prisma migrate deploy` (`scripts/db-migrate-if-configured.mjs`), so merging into `main` applies `2_marketing_measurement` and `3_marketing_reconciliation_and_spend_grain` to the production database. They are additive (new tables and enums only), but they are forward-only. The one-time production baseline in `docs/RELEASING.md` ("Production database") has to be done first, with the owner's go-ahead.
- The staging build applies the same two migrations to the staging database on the first deploy of `0a1a8e1`. Check that deploy succeeded before anything is planned for production.
- Production env vars to set before enabling anything: `CRON_SECRET`, `MARKETING_EVENTS_ENABLED`, `NEXT_PUBLIC_GTM_ID`, and the delivery and ad-sync credentials listed in `.env.example`. Leave the switches off at merge time; the tables can exist with the feature dormant.
- `vercel.json` adds the crons `/api/cron/marketing-deliver` (every 5 minutes) and `/api/cron/ads-sync` (daily). They run on Production only, so they start on the merge. Both do nothing while their switches are off.
- The privacy page rewrite needs the owner's or legal's review before it goes live.
- CI E2E on this branch was red on 2026-10-26 for `mobile-layout.spec.ts:64` only (the port dropdown had no options; cause not established, unconfirmed whether it also fails on `main`). Resolve or explain it before the PR.

## QC log

| Date | Check | How | Result |
|---|---|---|---|
| 2026-10-26 | Stage 1 unit tests | `pnpm exec vitest run tests/unit/features/marketing` | 29 passed |
| 2026-10-26 | Schema valid, client generates | `prisma validate`, `prisma generate` (dummy URL) | ok |
| 2026-10-26 | Typecheck | `tsc --noEmit` | clean |
| 2026-10-26 | Stage 2 unit tests | `vitest run`: conditional transition, duplicate/concurrent callback, currency/amount mismatch, late payment, adapter gating and payloads, retry/backoff, outage, claim race, replay, refund completion, consent-gated attribution read, cron auth | full suite 1181 passed |
| 2026-10-26 | Lint | `pnpm lint` | 0 errors (1 warning that predates this work, `postcss.config.mjs`) |
| 2026-10-26 | Stage 3 unit tests | `vitest run`: GTM bootstrap order and id validation, cookie regex vs real format, page_location sanitizer, dataLayer PII guard, collect consent/schema/PII/size/rate limits | 66 marketing tests pass |
| 2026-10-26 | Dev-server QC (no DB) | `pnpm dev` with a dummy DATABASE_URL, `NEXT_PUBLIC_GTM_ID=GTM-QCTEST1`, `MARKETING_EVENTS_ENABLED=true`; a Playwright script on `/privacy`, `/refunds`, `/id/privacy`, `/admin/login`, with Google/Meta hosts blocked | All of the following were checked: the banner shows and only `NEXT_LOCALE` is set before a choice. Denied defaults are pushed before `gtm.js`. `page_view` drops `email=` and keeps `gclid`. Accept writes `gf_consent`, `gf_vid` and `gf_attr` (the pre-consent gclid landing is captured), and consent updates to granted. Client-side navigation adds exactly one `page_view`, with a sanitized referrer. On reload, the default is followed by an update before GTM. Reject stores only `gf_consent`. The Indonesian copy shows. The footer reopens the banner. The admin login page loads no container |
| 2026-10-26 | E2E `marketing-consent.spec.ts` | Run against the same DB-less dev server (`E2E_BASE_URL`, pre-installed Chromium) | 5/5 passed |
| 2026-10-26 | Revision + stage 4 unit tests | `vitest run`: financial recognition (fulfilled, pending, unpaid, full refund before/after ticketing, partial refund bounds, refund in progress, forfeit, rejected refund, unknown DOKU fee, agent commission, Decimal vs float); metrics (CPA, ROAS, net contribution, zero denominators, spend unavailable/partial/currency mismatch, refund rates); direct vs unknown; consent withdrawal (visitor, admin, endpoint, dispatcher skip on send and replay); stuck-row reclaim guard; `unmatched_late_payment`; reconciliation (every exception code, idempotent audited repair that writes no ledger table); CSV parse/validation; replace-by-grain ingestion against an in-memory transactional store (identical re-import, correction, failed write, incomplete API, empty API, cleared empty days, late revision, partial success, reach apart); Google/Meta adapters on mocked responses (micros, pagination, errors, no token leak, no developer-token header); spend coverage and currency separation; route allocation (direct/allocated/unallocated/invalid/effective dates); cohort coverage; dashboard contracts; SUPER_ADMIN 401/403; sync switches; cron auth | full suite 1275 passed (88 files) |
| 2026-10-26 | Lint, typecheck | `pnpm lint`, `pnpm typecheck` | 0 errors (1 warning that predates this work), clean |
| 2026-10-26 | Dev-server QC (no DB) | `pnpm dev` with a dummy DATABASE_URL; curl every new route | `/api/admin/marketing/{spend-template,spend-import,sync,reconciliation,consent-withdrawal}` answer 401 without a session. `/api/cron/{ads-sync,marketing-deliver}` answer 401 without the secret; with it, ads-sync reports both platforms `DISABLED` and fetches nothing. `/api/marketing/consent` answers 204 while events are off |

Not checked in stage 3 (needs a database or real accounts): the collect endpoint actually writing rows; `BookingAttribution` written at booking creation; the browser purchase on `/b/[reference]` after a real or mock payment; GTM container tags firing (none published yet); GA4 DebugView, Tag Assistant and Meta Test Events.

Not checked in the revision and stage 4 (needs a database or real accounts): migrations 2 and 3 applied to Postgres (CI's `migrations` job will be the first run); reconciliation and the loaders against real rows; real Google Ads or Meta API responses (only mocks shaped from the official docs were used); the SUPER_ADMIN 200 paths that write (CSV import into a real table). The Google Ads v26 and Meta field names were taken from the provider docs checked on 2026-10-26. Two items were not confirmed field by field there: the full v26 field reference pages could not be loaded, and Data Manager's own upload age limit. Both need checking on first live use.

Not done: no database migration has been run anywhere. The owner chose **no database** for this work (2026-10-26). So there is no local Postgres, no `seed:qa` and no Playwright run. The migration is first exercised by CI's `migrations` job when the branch is pushed. E2E specs are written but recorded here as not run.
