# Marketing measurement

How GiliFast measures acquisition, paid bookings, fulfilled bookings, ad performance and business contribution. Status and QC history are in `docs/spikes/in-progress/FEATURE_MARKETING_MEASUREMENT.md`. The full setup and rollout guide (accounts, GTM, click-by-click) comes with stage 7.

The booking, payment, refund and ticket tables are the authority for money and fulfilment. GA4, Google Ads and Meta are separate measurement sources, and they will disagree with the ledger and with each other.

## Four questions, never one conversion

| Question | Measured by | Source |
|---|---|---|
| Marketing: did ads bring attributable bookings? | Booking attribution channel and campaign | `BookingAttribution`, frozen at booking creation |
| Payment: did bookings become verified paid transactions? | `purchase` event, `Payment.status = SUCCESSFUL` with `paidAt` | Signature-verified DOKU callback or server PayPal capture |
| Fulfilment: did paid bookings become confirmed tickets? | `seat_confirmed` + `ticket_issued`, booking `CONFIRMED` with tickets | Admin confirmation at `/admin/confirmations` |
| Financial: did they contribute after costs? | Retained commission, pre-ad contribution, net marketing contribution | `src/features/marketing/reporting/financials.ts` |

A verified payment is never treated as fulfilment: an operator can still refuse the booking, which triggers a full refund.

## Event dictionary

The source of truth is `src/features/marketing/contract.ts` (`EVENT_DICTIONARY`). In lifecycle order:

| Event | When | Sent to |
|---|---|---|
| `booking_request_created` | Booking row committed (`PENDING_PAYMENT`) | internal |
| `begin_checkout` | DOKU session or PayPal order created | internal |
| `payment_failed` | Verified failed attempt (keyed per gateway attempt) | internal |
| `purchase` | First verified payment (`PENDING_PAYMENT` → `AWAITING_CONFIRMATION`) | GA4 MP, Google Ads (Data Manager), Meta CAPI as `Purchase`; browser Pixel copy with the same `event_id` |
| `seat_confirmed`, `ticket_issued` | Operator confirmed, tickets minted (same transaction) | internal |
| `booking_cancelled` | Any cancel or expiry | internal |
| `refund` | Refund marked COMPLETED | GA4 MP `refund` (with the original `transaction_id`) |
| `unmatched_late_payment` | Verified payment for an expired or cancelled booking | internal; never a purchase |

## Optimising Google Ads for payment versus fulfilment

The primary Google Ads conversion is the server `purchase` at verified payment. Changing it to fulfilment (`ticket_issued`) needs the owner's decision.

- **Payment as the conversion (current).**
  - For: it fires within minutes, so bidding learns fast. It is backed by a verified gateway callback. It uses the stored click id while the click is fresh.
  - Against: bookings the operator later refuses (fully refunded) are still counted by Google. The conversion is not retracted automatically: refunds are not uploaded as adjustments in phase one.
- **Fulfilment as the conversion.**
  - For: it counts only bookings that became tickets, which is closer to earned commission.
  - Against: it arrives after a manual phone confirmation, so it is delayed and sparser, and bidding learns more slowly.
  - Against: Data Manager takes the upload while the click is within the conversion action's lookback window, which is 90 days at most and may be set shorter.
  - Against: the Pixel/CAPI pair would also lose the 48-hour browser/server deduplication window.

Whichever is chosen, the dashboard reports paid-booking CPA and fulfilled-booking CPA side by side, so Google's optimisation target never becomes the business metric.

## Financial contract

The source is `src/features/marketing/reporting/financials.ts`. Every money value is a Prisma `Decimal` and carries a provenance:

- **actual**: read from the ledger.
- **estimated**: from a documented model, such as allocated spend.
- **unknown**: the ledger does not hold the fact. The value is null with reasons, and bounds where possible.

An unknown is never a zero.

| Metric | Definition (per booking, summed over verified-paid bookings of one currency) |
|---|---|
| Gross booking value | `Booking.totalAmount`. Customer money, not revenue |
| Expected commission | `Booking.commissionAmount` of a paid booking. It covers fare commission plus the platform service fee, net of any promo GiliFast bears (`pricing.ts`) |
| Earned commission | Expected commission once the booking is fulfilled (confirmed and ticketed), or forfeited (customer cancelled with no refund due). 0 while awaiting confirmation |
| Refunded commission | Commission reversed out of what was earned. A completed full refund after ticketing reverses all of it. A partial refund is **unknown, with bounds [0, min(refund, commission)]**, because the ledger does not record how it splits between GiliFast and the operator. It is never prorated |
| Retained commission | Earned − refunded |
| Forfeited expected commission | Expected commission never earned because the booking was refunded before fulfilment (operator rejection) |
| Payment processing cost | `Payment.gatewayFee` when > 0. **Unknown otherwise**: the column defaults to 0 and the DOKU integration never writes it. PayPal fees are converted to IDR at the stored capture rate |
| Refund processing cost | Unknown whenever a refund exists. Not recorded anywhere |
| Other variable costs | Travel-agent commission (`agentCommissionAmount`) where present. No other per-booking cost is recorded |
| Pre-ad contribution | Retained − payment cost − refund cost − other variable costs. Unknown if any term is unknown; bounds when all terms have them |
| Advertising spend | Validated imported spend for the same scope (`AdSpendDaily`), per currency |
| Net marketing contribution | Pre-ad contribution − advertising spend. Excludes fixed overhead, so it is not profit |

Recognition rule: payment alone earns nothing, and a refund before fulfilment means the commission was never earned. There is no settlement ledger, so nothing about operator payouts is inferred.

## Marketing metrics

The source is `src/features/marketing/reporting/metrics.ts`. Each result is `ok`, `partial` (computed over the known part only, with reasons), or `unavailable` (a zero denominator, no spend data, or a currency mismatch). None is ever coerced to 0 or infinity.

| Metric | Formula |
|---|---|
| Paid booking CPA | spend / verified paid bookings |
| Fulfilled booking CPA | spend / fulfilled paid bookings |
| Commission ROAS | retained commission / spend |
| Contribution ROAS | pre-ad contribution / spend |
| Net marketing contribution | pre-ad contribution − spend |
| Payment-to-fulfilment rate | fulfilled / paid. Partial while bookings await the operator call |
| Refund rate | by count (paid bookings with a refund / paid bookings) and by value (refunded value / GMV), always separately |
| Contribution per fulfilled booking | pre-ad contribution / fulfilled bookings |

These are attributed and period figures. Nothing here measures causal incrementality. Experiments would need their own design.

## Attribution

Sources: `src/features/marketing/attribution.ts` and `booking-attribution.ts`.

The model is the last eligible non-direct touch within `ATTRIBUTION_LOOKBACK_DAYS` (default 30), frozen at booking creation, so a confirmation delay or a DOKU round trip cannot change it.

| Group | Meaning |
|---|---|
| `attributed_paid` | Google Ads, Meta Ads, other paid (UTM paid mediums, click ids) |
| `attributed_non_paid` | Organic search, social, referral, email |
| `direct` | A recorded direct first visit, or campaign touches all older than the lookback |
| `unknown` | Consent given but no visit recorded (cookie cleared or capped). **Not organic, not direct** |
| `consent_unavailable` | No analytics or marketing consent at booking time |

A campaign is never inferred from timing, and missing attribution is never filled in retroactively.

**Consent withdrawal** (`consent-withdrawal.ts`) works as follows:

- When a visitor narrows their banner choice, their past bookings (linked by the analytics visitor id) are marked, and their matching identifiers are wiped.
- Queued deliveries are skipped.
- The dispatcher re-checks the booking's current consent before every send and replay.
- An admin can withdraw by booking (`POST /api/admin/marketing/consent-withdrawal`).
- Limit: a visitor who gave marketing consent alone has no visitor id, so only the admin path reaches their bookings. Events already delivered cannot be recalled.

## Reconciliation

The source is `src/features/marketing/reporting/reconciliation.ts`. It is read-only and returns structured exceptions:

- paid booking without a `purchase` event
- conflicting purchases
- purchase without a verified payment
- purchase amount or currency mismatch with the payment
- completed refund without a refund event, or with an amount mismatch
- fulfilled booking without fulfilment events
- late payment on a closed booking
- permanently failed deliveries
- missing attribution
- events for a missing booking

The explicit repair (`POST /api/admin/marketing/reconciliation` with `confirm: "record-missing-marketing-events"`, SUPER_ADMIN) records only missing internal events. It takes timestamps from the ledger, writes an audit row for each event, and is idempotent. It never changes a booking, payment, refund, ticket or settlement figure.

## Advertising spend

Sources: `src/features/marketing/ads/`.

**Google Ads** (v26 `searchStream`, OAuth, `login-customer-id` for MCC access):
- Queried at campaign level, because ad-level rows miss Performance Max spend.
- Cost micros are converted with Decimal arithmetic.
- `metrics.conversions` is the primary-conversion count by click date, stored as platform-reported.

**Meta** (v26.0 Insights):
- Queried at ad level, one row per ad per day; ad rows sum to the account.
- Reach and frequency come from a separate campaign-level request into `AdReachDaily`. They are never summed: reach is unique people.
- Purchases are taken as `omni_purchase`, then `purchase`, then the pixel purchase, on a 7-day click / 1-day view window at conversion time. Figures can change for 28 days, which the rolling backfill (`ADS_BACKFILL_DAYS`) re-reads.

**CSV**:
- Template from `GET /api/admin/marketing/spend-template`; upload via `POST /api/admin/marketing/spend-import` (SUPER_ADMIN, max 5 MB).
- A file with any invalid row is refused whole, and the response lists the lines.

**Ingestion** (`ingest.ts`) replaces by grain: the unit is one account-day.

- Each covered account-day's rows are deleted and re-inserted in one transaction. Re-imports add nothing, corrections replace exactly their days, and a failed write keeps prior data.
- One reporting level and one breakdown set per account-day. Mixed grain, mixed currency or timezone per account, duplicates and negatives are rejected per scope.
- **CSV scope**: only the account-days in the file. A file cannot erase days it does not mention.
- **API scope**: every day of the requested range, and only when the response is confirmed complete.
  - An incomplete response writes nothing.
  - An empty complete response for a range that has stored spend writes nothing and is reported.
  - Days returned empty while others have data are cleared as genuinely empty.
- Each run writes an `AdSyncRun` row with status, row counts, content hash and a per-scope report.

**Coverage** (`reporting/spend.ts`):
- An account-day with neither rows nor a confirmed-empty sync is a gap, and any spend figure over a range with gaps is partial.
- Totals are per currency. A conversion would need a documented FX source and date, which is not implemented.

## Routes

Source: `reporting/route-allocation.ts`. Data: `MarketingCampaignRouteMapping`.

- A mapping is optional, per campaign, with effective dates and provenance.
- `DIRECT`: the campaign advertises one route, so its spend is observed route spend.
- `ALLOCATED`: weights summing to at most 1. Spend is split as an estimate and always labelled so; any remainder is unallocated.
- Spend for unmapped campaigns, or under invalid mappings, stays unallocated. It is never spread.
- Route bookings come only from booking attribution. Unattributed bookings are never distributed across routes.

## Time models

Source: `reporting/time-models.ts`.

- **Period**: spend on ad-account-local days next to bookings by payment time in `REPORT_TIMEZONE` (default Asia/Jakarta). Labelled as a period comparison.
- **Cohort**: bookings grouped by the date of their recorded last eligible touch. Bookings without a touch time are counted as uncovered.
- Daily spend is never re-split by hour.

## Access

Every marketing API (`/api/admin/marketing/*`) requires SUPER_ADMIN through `superAdminOrResponse` (401 with no session, 403 for staff). The Stage 5 pages will use `requireSuperAdmin()`. Click ids, IP addresses and user agents are never part of a report, export or log.
