# Phase-one marketing measurement and performance dashboard (Google Ads + Meta)

**Status (2026-10-26):** in progress on `claude/magical-curie-gi16o3`, which is based on `staging`. Stage 0 (discovery) and stage 1 (contract + schema) are written. Nothing is deployed, and no live tag, API or ad account has been touched.
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
- [ ] 2. Verified payment events and outbox delivery.
- [ ] 3. GTM, consent banner, attribution capture, privacy page.
- [ ] 4. Ad spend ingestion (APIs + CSV).
- [ ] 5. Dashboard.
- [ ] 6. Reconciliation tests and e2e.
- [ ] 7. Docs and release (1.11.0).

## Migration notes

`2_marketing_measurement` is additive: it creates 6 tables and 6 enums and changes nothing existing. The SQL was generated with `prisma migrate diff --from-schema-datamodel <staging schema> --to-schema-datamodel prisma/schema.prisma`, which needs no database. RLS lines were added by hand, following the `OperatorPicContact` convention. CI's `migrations` job applies it to Postgres 16 and checks for drift.

Rollback before data matters: a new migration that drops the six tables and enums. Once data exists, switch off with the env flags instead; the tables can stay.

## QC log

| Date | Check | How | Result |
|---|---|---|---|
| 2026-10-26 | Stage 1 unit tests | `pnpm exec vitest run tests/unit/features/marketing` | 29 passed |
| 2026-10-26 | Schema valid, client generates | `prisma validate`, `prisma generate` (dummy URL) | ok |
| 2026-10-26 | Typecheck | `tsc --noEmit` | clean |

Not done: no database migration has been run anywhere. The owner chose **no database** for this work (2026-10-26). So there is no local Postgres, no `seed:qa` and no Playwright run. The migration is first exercised by CI's `migrations` job when the branch is pushed. E2E specs are written but recorded here as not run.
