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

### Changed

- Docs only: the release-prep checklist (`PRE_PROD_STAGING_TO_MAIN.md`) now lists v1.9.0 to v1.10.1, the live Part B test and the temporary staging setup; the two spike docs for the e-ticket email and the check-in guide are marked tagged.

## [1.10.1] - 2026-10-24

### Changed

- The PIC "order paid" WhatsApp now prints the buyer's name followed by the Gilifast booking code on the contact line ("Nama: Rafath Test BK-2026-10-ABC234"), so the PIC types both into the operator's dashboard and the operator's ticket email greets "Hi <name> <code>", which is what the e-ticket forward matches on. The template and its nine variables are unchanged.

## [1.10.0] - 2026-10-24

### Added

- Blog article "Where to check in for Wahana Virendra fast boats: a harbour-by-harbour guide" at `/blog/wahana-virendra-checkin-guide`: where the counter is at Sanur, Nusa Penida (Banjar Nyuh), Padang Bai, Gili Trawangan, Gili Air, Senggigi and Bangsal, with a landmark, a Maps link and the harbour tax at each, plus a short pre-boarding checklist. English only. The e-ticket email's "check-in guideline" line now ends with this link, in both languages. Design and QC: `docs/spikes/FEATURE_BLOG_CHECKIN_GUIDE.md`.

## [1.9.0] - 2026-10-24

### Changed

- The operator's ticket email is no longer passed on as it came. The buyer now gets an email written by Gilifast with the operator's PDF attached: subject `Your E-Ticket & Booking Confirmation - <Gilifast booking code>`, then operator, Gilifast code, the operator's own code (read from its email, `-` if absent), departure, arrival (departure plus the schedule's duration, WITA) and passengers. A round trip repeats the block under "Departure 1" / "Departure 2" ("Keberangkatan 1" / "Keberangkatan 2"). The text is Indonesian when the booking's contact nationality is Indonesia and English for every other nationality (or none). Design: `docs/spikes/FEATURE_ETICKET_FORWARD_TEMPLATE.md`.
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

[Unreleased]: https://github.com/condoriano98/gilijet/compare/v1.10.1...HEAD
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
