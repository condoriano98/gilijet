# Changelog

All notable changes to Gilifast are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). How versions are chosen and
released: [`docs/RELEASING.md`](docs/RELEASING.md).

Every feature bumps MINOR and every bug fix bumps PATCH, with a dated section
here, in the same commit as the change. Work that changes nothing for users
(docs, tests, refactors) is listed under `[Unreleased]` and ships with the next
bump. A version is live in production once its tag is merged into `main`.

## [Unreleased]

### Added

- The e2e runner refuses to touch any database but the local Docker Postgres: `playwright.config.ts` stops when `DATABASE_URL`, `DIRECT_URL` or `E2E_BASE_URL` is not local, never reuses a server already on port 3000, forces throw-away secrets and blanks every outbound credential. Every spec now starts as a first-time visitor (no saved consent choice, banner open); `tests/e2e/support/consent.ts` saves a choice for the one spec that needs it.
- End-to-end tests for the search form's From and To dropdowns on home, `/search` and `/id`, at laptop and phone size, including a first visit with the consent banner open. Test `CONT-035` guards that the banner does not cover the To field on a first visit (bug B14, fixed).
- Redesign stage 0 (staging only, not released): `docs/DESIGN_SYSTEM.md`, the `ui-designer` agent, the `brand-surface`, `brand-line`, `brand-text` and `brand-muted` colour tokens, and test `CONT-009b` for the new footer.
- End-to-end tests at phone width: the Playwright project `mobile-flow` runs the booking, lookup and search specs on a 375 px phone, and `mobile-sweep.spec.ts` checks 15 pages for sideways scroll and covered buttons. They found that the booking page is 16 px wider than a 375 px phone (bug B12, not fixed yet).
- Marketing measurement groundwork (in progress, not live; every switch defaults to off): a typed event contract with GA4/Google Ads/Meta mappings, consent and attribution helpers, PII guards, and migration `2_marketing_measurement`. The migration adds `MarketingEvent`, `MarketingEventDelivery`, `BookingAttribution`, `AdSpendDaily`, `AdReachDaily` and `AdSyncRun`, all with RLS enabled. New env switches are documented in `.env.example`, which now also lists `CRON_SECRET`. Spike: `docs/spikes/in-progress/FEATURE_MARKETING_MEASUREMENT.md`.
- Marketing events and outbox (off until `MARKETING_EVENTS_ENABLED` / `MARKETING_DELIVERY_ENABLED` are `true`):
  - The booking lifecycle records `booking_request_created`, `begin_checkout`, `payment_failed`, `purchase`, `seat_confirmed`, `ticket_issued`, `booking_cancelled` and `refund` in the same transaction as each change.
  - A new cron, `/api/cron/marketing-deliver`, sends purchases to GA4 (Measurement Protocol), Meta (Conversions API) and Google Ads (Data Manager API). Each send is gated on consent and match data, and failed sends are retried with backoff.
  - `/admin/refunds` has a "Mark money returned" action that completes approved refunds.
- Consent banner and tag manager (customer pages only; nothing loads unless `NEXT_PUBLIC_GTM_ID` is set or `MARKETING_EVENTS_ENABLED=true`):
  - Google Consent Mode v2 defaults to denied, and the container loads only after those defaults are set.
  - Page views are sanitized: booking references are masked, and personal data is never pushed.
  - `search`, `view_item` and the browser purchase are pushed. The browser purchase fires only after the backend has recorded the verified payment.
  - Ad-click attribution is captured with consent and frozen on the booking.
  - A new `/api/marketing/collect` endpoint takes funnel counts.
  - The privacy policy's cookie, sharing and retention sections are rewritten.
- Marketing measurement revision and ad spend ingestion (stage 4; everything off by default):
  - **Financial contract.** Commission is expected at payment and earned only on fulfilment. Partial refunds and unrecorded fees are reported as unknown, never as zero or prorated. Paid and fulfilled CPA, commission and contribution ROAS, and net marketing contribution are computed in Decimal. Unattributed bookings are reported as unknown, never as direct or organic.
  - **Consent and reconciliation.** Consent can be withdrawn after booking (banner and admin), and pending sends stop. A read-only ledger-to-marketing reconciliation can be followed by an explicit, audited repair that only records missing marketing events.
  - **Spend ingestion.** Daily spend comes from Google Ads (v26) and Meta (v26.0) or a validated CSV. Ingestion replaces whole account-days, so re-imports never add spend and failed or empty syncs never erase it.
  - **Routes and access.** Optional campaign-to-route mappings keep direct spend apart from allocated spend, which is labelled an estimate.
  - **New endpoints and data:** SUPER_ADMIN APIs under `/api/admin/marketing/`, a daily `/api/cron/ads-sync`, and migration `3_marketing_reconciliation_and_spend_grain`. The design reference is `docs/MARKETING_MEASUREMENT.md`.
- CI's e2e job now runs with marketing events on and delivery off. The Playwright config pre-sets an "essential only" cookie choice so the banner cannot cover other specs.

### Fixed

- Sign-in and registration no longer follow a `next` link to another website: only a path on this site is accepted (the Google sign-in routes use the same check, which now also refuses `/\host` and control characters).
- Booking and registration with the terms box unticked now say to accept the terms. Before, the server refused but showed `Expected string, received null` (booking) or "fill in all required fields" (registration).
- Cancelling a booking that was never paid no longer queues a refund for money that was never taken. A paid booking still gets its refund.

### Changed

- The cookie banner is compact: a 320 px card in the bottom-right corner on a laptop and a short bar on a phone (one line of text, the full text under "Choose"), so it no longer covers the To field of the search form on a first visit (bug B14). Buttons, texts and the consent logic are unchanged. The home hero is 16 px shorter on a phone.
- Search results redesign (stage 2, staging only, not released): filters in a left column, result and connection cards, a styled round-trip selector, and one `h1` per page. The step indicator is blue on every booking page. Queries, prices and links are unchanged.
- Home page redesign (stage 1, staging only, not released): inset hero, floating search card, bento destinations, route rows, blue "Why book" band, numbered steps and a blue operator banner, with the search form restyled (the same form on `/search` looks the same; its results are restyled in stage 2). Data, links, search parameters and the heading text are unchanged; the wave dividers are gone and the home route is now checked for 44 px buttons.
- Customer header and footer follow the redesign: a white header without the blue utility bar above it (the contact details and the static "English" label are gone from the top; both contacts stay in the footer), and a light footer without the wave band. They are now the components `SiteHeader` and `SiteFooter`. Links, consent settings, payment partners and auth buttons behave as before.
- Marketing delivery workers can no longer both reclaim the same stuck send.
- Payment, confirmation and operator-rejection transitions now use a conditional update, so two DOKU callbacks arriving at once can no longer both record a payment. A DOKU notification naming a currency other than IDR is now refused. A verified payment for a booking that had already expired or been cancelled is logged as an unmatched payment rather than passing silently.
- `vercel.json` now schedules `/api/cron/poll-operator-inbox` every 5 minutes, so the operator ticket mailbox (`admin@gilifast.com`) is polled once this reaches production. It stays a dry run until `INBOX_POLL_LIVE=true` is set in the production environment, so nothing is forwarded to buyers by this change alone.
- Docs only: the release-prep checklist (`PRE_PROD_STAGING_TO_MAIN.md`) now lists v1.9.0 to v1.10.1, the live Part B test and the temporary staging setup; the two spike docs for the e-ticket email and the check-in guide are marked tagged.
- Docs only: `docs/spikes/` is now sorted by status into `todo/`, `in-progress/` and `done/`; paths that pointed at the old flat layout were updated.
- Refactor, no behaviour change: values used in more than one place or that are policy now live in `src/shared/constants/` (time units, timezone, currency, cookie names and session length, login paths, commission default, base URL default) and in `src/features/<domain>/constants.ts` (refund cutoff, review window, search lookahead, cash-drawer methods, marketing cookie lifetimes). The 48-hour cutoff was written twice (`refunds.ts` and the booking page) and is now one constant; the base URL fallback was repeated in four files and is now `siteUrl()`. A unit test pins every moved value and fails on new inline time or currency literals. Spike: `docs/spikes/in-progress/FEATURE_CONSTANTS_FOLDER.md`.

## [1.10.3] - 2026-10-30

### Fixed

- The browser tab now has the Gilifast speedboat as its icon (it showed the default globe), and a home-screen icon for iOS. The locale proxy no longer rewrites `/icon` and `/apple-icon` into 404s.
- Tab titles fit and are no longer doubled. The default is "Gilifast · Fast Boat Tickets" (the long form stays on share cards). Twelve customer pages that spelled out "· Gilifast" themselves, and so read "About · Gilifast · Gilifast", now give the bare title. Operator and admin pages have their own default ("Operator · Gilifast", "Admin · Gilifast") instead of the customer title, and the blog index and "Change my plans" titles are shortened.

## [1.10.2] - 2026-10-29

### Fixed

- A round trip is no longer charged as two one-way tickets. Each leg of a round trip is now priced at half of the operator price sheet's return fare for that leg's season (`fareMatrix.return`), so a pair in the same season adds up to exactly the return fare; across seasons it is the average of the two. One-way bookings, hand-set leg prices and schedules without a fare matrix are unchanged, and existing bookings are not recalculated. The search results, booking form, booking engine and round-trip email all read the same resolver. Spike: `docs/spikes/in-progress/BUG_ROUND_TRIP_PRICE_EQUALS_TWO_ONE_WAY.md`.

## [1.10.1] - 2026-10-24

### Changed

- The PIC "order paid" WhatsApp now prints the buyer's name followed by the Gilifast booking code on the contact line ("Nama: Rafath Test BK-2026-10-ABC234"), so the PIC types both into the operator's dashboard and the operator's ticket email greets "Hi <name> <code>", which is what the e-ticket forward matches on. The template and its nine variables are unchanged.

## [1.10.0] - 2026-10-24

### Added

- Blog article "Where to check in for Wahana Virendra fast boats: a harbour-by-harbour guide" at `/blog/wahana-virendra-checkin-guide`: where the counter is at Sanur, Nusa Penida (Banjar Nyuh), Padang Bai, Gili Trawangan, Gili Air, Senggigi and Bangsal, with a landmark, a Maps link and the harbour tax at each, plus a short pre-boarding checklist. English only. The e-ticket email's "check-in guideline" line now ends with this link, in both languages. Design and QC: `docs/spikes/done/FEATURE_BLOG_CHECKIN_GUIDE.md`.

## [1.9.0] - 2026-10-24

### Changed

- The operator's ticket email is no longer passed on as it came. The buyer now gets an email written by Gilifast with the operator's PDF attached: subject `Your E-Ticket & Booking Confirmation - <Gilifast booking code>`, then operator, Gilifast code, the operator's own code (read from its email, `-` if absent), departure, arrival (departure plus the schedule's duration, WITA) and passengers. A round trip repeats the block under "Departure 1" / "Departure 2" ("Keberangkatan 1" / "Keberangkatan 2"). The text is Indonesian when the booking's contact nationality is Indonesia and English for every other nationality (or none). Design: `docs/spikes/in-progress/FEATURE_ETICKET_FORWARD_TEMPLATE.md`.
- The PIC "order paid" WhatsApp (`order_masuk_operator`) now carries Gilifast's email (`admin@gilifast.com`) and phone (`+62 813-3399-869`) in the email and phone variables instead of the buyer's, so the PIC creates the operator ticket with our contact details and the buyer's details are not shared. The template and its nine variables are unchanged (the 1.7.0 entry above still lists the buyer's email and phone; that is outdated).

## [1.8.0] - 2026-10-22

### Added

- WhatsApp webhook (`/api/webhooks/whatsapp`): answers Meta's callback-URL verification and records the delivery status of the messages we send (sent, delivered, read, failed, with Meta's reason) in the admin Webhooks page under provider `whatsapp`, so a PIC message that was rejected or not delivered is visible. Replies are not stored. Needs `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET`; without them the route answers 503.

## [1.7.2] - 2026-10-22

### Fixed

- Admin bookings: the Passengers column showed 0 for every booking waiting for confirmation, because it counted issued tickets and tickets only exist after the admin confirms. It now counts the passengers on the booking itself.

## [1.7.1] - 2026-10-22

### Fixed

- The "order paid" WhatsApp to the operator's PICs, the staff alert and the customer's payment-received email and WhatsApp were started after the payment callback had already been answered, so the hosting platform froze the function and they were dropped or only resumed on a later request. They now run to completion after the response (`after()`), and the staff and PIC messages no longer wait behind a slow customer email.

## [1.7.0] - 2026-10-22

### Changed

- WhatsApp now goes out through the Meta WhatsApp Cloud API instead of WATI (WATI was never connected, so nothing was sent before). The PIC "order paid" message uses the approved `order_masuk_operator` template: booking code, boat, route, date and time, buyer name, email and phone, passenger count and the passenger list (name, category, nationality; no gender, the booking form does not collect it). A round trip puts the return leg into the route and date lines. Payment-received, boarding-pass and cancellation messages are still plain session messages, which WhatsApp delivers only within 24 hours of the customer writing to the number. Without `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` nothing is sent and the message is only logged, as before.
- Environment variables: `WATI_API_KEY`, `WATI_TENANT_ID` and `WATI_API_URL` are replaced by `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION` and `WHATSAPP_TEMPLATE_LANG`; `PIC_ORDER_TEMPLATE` is now `WHATSAPP_TEMPLATE_ORDER_NOTIF`. The staff alert template (`/admin/console/alerts`) takes nine positional variables, in the order listed on that page.

### Changed

- Staging test tooling: Rp 1 Padang Bai ⇄ Senggigi departures (`pnpm seed:one-rupiah`) and an opt-in e2e for the live DOKU hand-off. Nothing changes for customers on production.
- `scripts/seed-pic-contacts.ts` stores PIC phone numbers as `628…` digits (a spreadsheet drops the leading 0).
- Agent rules (`CLAUDE.md` rule 9): a direct push to `main` needs two separate warnings and confirmations.

## [1.6.0] - 2026-10-20

### Added

- **Check mailbox now** button on the admin E-tickets page (`/admin/eticket-delivery`): reads the operator mailbox immediately, the same way the poll route does, and reports how many new emails were found, forwarded (or, in dry-run mode, would be forwarded), need review or failed. Needed because Vercel Cron only runs on production and the poll is not scheduled yet.
- `INBOX_POLL_SINCE` (YYYY-MM-DD, WITA): the operator inbox poll only looks at mail that arrived on or after that day, judged by arrival time. Unset keeps the last 7 days.

## [1.5.0] - 2026-10-20

Replaces the Resend transport that 1.4.0 introduced (1.4.0 was never tagged or released): mail now goes out over Gmail SMTP and the operator's ticket emails are read over IMAP.

### Added

- The operator ticket mailbox (admin@gilifast.com) is read over IMAP by `/api/cron/poll-operator-inbox` (secured by `CRON_SECRET`; scheduled every 5 minutes in `vercel.json`, see Unreleased). It looks at the last 7 days of mail from the operators' confirmation addresses, never changes the mailbox, and remembers what it has handled by Message-ID. It is a dry run, reporting what it would forward, until `INBOX_POLL_LIVE=true` is set. Needs `INBOX_IMAP_*` and a Gmail app password.
- A ticket email is forwarded only when the receiving server vouches for the sender (DMARC pass for the From domain, or DKIM aligned with it), the From has exactly one address, and it is exactly an operator's confirmation address.
- The forwarded message is plain text plus the original PDF: the operator's HTML is no longer passed on.

### Changed

- All email now goes out over SMTP (`nodemailer`, Gmail app password; `SMTP_*`, `EMAIL_FROM`) instead of Resend. Without them nothing is sent and the message is only logged, as before. `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `RESEND_INBOUND_SECRET` are no longer read, and `/api/webhooks/resend-inbound` is removed.
- The `/admin/webhooks` provider for operator emails is now `imap-inbox` (older `resend-inbound` rows from staging testing stay as history).

### Fixed

- A network error while sending the forwarded ticket left a record saying it was already forwarded, so the retry skipped it and the buyer never got the ticket. A failed send now always releases that record.
- An operator email with no PDF attached was forwarded as a bare message. It now waits for the admin on the E-tickets page, as does one that cannot be read (too large, corrupt) or is no longer in the mailbox when the admin picks a booking.
- The operator's own booking code (for example `BK-261016-QSZPC4`) could be misread as one of ours; a Gilifast code now needs separators between its year, month and suffix.

## [1.4.0] - 2026-10-18

> **2026-10-20:** the Resend inbound transport described below was replaced by IMAP polling in 1.5.0 before 1.4.0 was released. The matching, forwarding and admin page are unchanged.

### Added

- When a booking is paid, the operator's PICs (and Gilifast's own contact) get a WhatsApp message with the booking code, passengers, boat, route and departure time, so they can create the ticket in the operator's dashboard. Information only: the booking still waits for the admin's confirmation. Needs the WATI template named in `PIC_ORDER_TEMPLATE`; without it nothing is sent. Part A of the e-ticket feature; it ships as a release together with Part B.
- The operator's e-ticket email is forwarded to the buyer automatically. admin@gilifast.com forwards Wahana's mail to a Resend inbound address, Resend calls `/api/webhooks/resend-inbound`, and the app sends the email and its PDF to `Booking.customerEmail`, with the subject suffixed `_<booking reference>` and a "Gilifast Booking code" line. The booking is found by the Gilifast code typed after the customer's name; without a code, by name plus departure time when exactly one booking fits. Nothing else is sent. The booking stays awaiting the admin's confirmation.
- Admin page **E-tickets** (`/admin/eticket-delivery`): emails that could not be matched (with a pick-a-booking forward), paid bookings still waiting for the operator's ticket, and what was delivered. Operator emails also appear in `/admin/webhooks`.

## [1.3.1] - 2026-10-16

### Fixed

- A customer who has paid no longer sees the raw status "AWAITING CONFIRMATION"
  on the booking page (`/b/…`) and in "My bookings". It now reads "Paid ·
  confirming your seat" (and "Awaiting payment" before payment). The payment was
  already recorded; only the wording made it look unpaid.

## [1.3.0] - 2026-10-16

### Added

- Admin **Webhooks** page (`/admin/webhooks`): every DOKU and PayPal callback the
  app received, with status, attempts and error, filters by provider, status and
  booking reference, and a Retry button for failed events. Callbacks rejected for
  a bad signature are listed too.
- `/admin/diagnostics` shows how many callbacks failed in the last 24 hours.

### Changed

- Admin bookings: a paid booking now reads "Paid · awaiting confirmation" (and an
  unpaid one "Unpaid") instead of the raw status name, so a payment that is
  waiting for the operator call is no longer mistaken for one the payment
  gateway never reported. The booking flow itself is unchanged: tickets are
  still issued after an admin confirms with the operator.
- Admin bookings refreshes itself every 30 seconds while the tab is open, so a
  payment that lands shows up without a manual reload.

### Fixed

- Payment callbacks larger than 256 KB are refused (413), and a PayPal verification outage answers 503 so PayPal redelivers.
- The scheduled retry of failed payment callbacks did nothing for DOKU: it
  marked the event done without recording the payment, and it never looked at
  PayPal. It now re-runs the same handler as the first delivery for both.
- Callbacks that were refused (bad signature, unreadable body, unknown booking,
  amount mismatch) left no record. They are now logged.

## [1.2.0] - 2026-10-14

### Added

- Admin bookings list: a "Trip Type" filter (All / One way / Round trip) that
  works together with the status and payment-method filters and the search box.
- Booking page for a round trip: the price summary now shows the Outbound and
  Return fares separately, above the total.

### Changed

- Database schema changes are now Prisma migrations (`prisma/migrations/`)
  instead of `prisma db push` on every build. The build applies pending
  migrations on production and staging only; other preview builds no longer
  touch a database. CI checks that the migrations build an empty database and
  match `schema.prisma`.

### Fixed

- The bookings CSV export ignored the payment-method filter and exported more
  rows than the list on screen. It now applies the same filters as the list.
- "Departing soon" on the home page and the reschedule options could show fewer
  departures than they should when some departures fall on closed (OFF) days.

## [1.1.1] - 2026-10-14

### Fixed

- Cancelling a departure from the admin console now tells customers why: the
  reason the admin typed appears in the cancellation email and WhatsApp message.
- Customers can request a date change again. Every request from the reschedule
  page failed with "Invalid input" because the form sent no note field.
- A date-change request can no longer target a departure on a closed (OFF)
  day, even if the page is stale or the form is edited by hand.

## [1.1.0] - 2026-10-14

First versioned release on `staging`; collects everything built since 1.0.0.

### Added

- Round-trip booking end to end: return search, one checkout for both legs,
  both boarding passes by email and WhatsApp, round-trip display in the admin
  bookings view.
- Seasonal pricing: fares follow the departure date's season (LOW / HIGH /
  PEAK / OFF) from a season calendar; OFF days cannot be booked; a manual
  departure price opts that departure out of its season.
- Owner console **Seasons** tab to manage the season calendar
  (`/admin/console/seasons`), and `pnpm seed:seasons` for the 2026/27 calendar.
- Version, commit and branch of the running build on `/admin/diagnostics`.

### Fixed

- Round-trip search no longer crashes when listing outbound and return trips.
- Round-trip passengers are checked in per leg, so the return leg is no longer
  rejected as "already checked in".
- Round-trip passengers appear in operator manifests and admin departure views.
- Cancelling a departure cancels, refunds and notifies round-trip bookings too.
- Round-trip WhatsApp sends both boarding passes, and cancellation messages
  name both legs.

### Changed

- Application code moved to `src/` with one-way layering
  `app` → `features` → `shared`, enforced by ESLint.
- Unit test suite (Vitest) and Playwright end-to-end specs, including seasonal
  pricing and the admin Seasons tab.

## [1.0.0] - 2026-10-07

Baseline: the version live at gilifast.com when versioning was introduced
(commit `88d0781` on `main`). Customers search, book one-way trips, pay with
DOKU Checkout or PayPal and check in with a QR boarding pass; operators run
schedules, departures, POS, cash and reporting; admins onboard operators,
confirm bookings with operators, handle refunds and tune platform economics.
Earlier history is in git; this tag was applied retroactively.

[Unreleased]: https://github.com/condoriano98/gilijet/compare/v1.10.3...HEAD
[1.10.3]: https://github.com/condoriano98/gilijet/compare/v1.10.2...v1.10.3
[1.10.2]: https://github.com/condoriano98/gilijet/compare/v1.10.1...v1.10.2
[1.10.1]: https://github.com/condoriano98/gilijet/compare/v1.10.0...v1.10.1
[1.10.0]: https://github.com/condoriano98/gilijet/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/condoriano98/gilijet/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/condoriano98/gilijet/compare/v1.7.2...v1.8.0
[1.7.2]: https://github.com/condoriano98/gilijet/compare/v1.7.1...v1.7.2
[1.7.1]: https://github.com/condoriano98/gilijet/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/condoriano98/gilijet/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/condoriano98/gilijet/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/condoriano98/gilijet/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/condoriano98/gilijet/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/condoriano98/gilijet/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/condoriano98/gilijet/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/condoriano98/gilijet/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/condoriano98/gilijet/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/condoriano98/gilijet/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/condoriano98/gilijet/releases/tag/v1.0.0
