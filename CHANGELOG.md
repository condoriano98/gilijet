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

- Staging test tooling: Rp 1 Padang Bai ⇄ Senggigi departures (`pnpm seed:one-rupiah`) and an opt-in e2e for the live DOKU hand-off. Nothing changes for customers on production.
- Agent rules (`CLAUDE.md` rule 9): a direct push to `main` needs two separate warnings and confirmations.

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

[Unreleased]: https://github.com/condoriano98/gilijet/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/condoriano98/gilijet/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/condoriano98/gilijet/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/condoriano98/gilijet/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/condoriano98/gilijet/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/condoriano98/gilijet/releases/tag/v1.0.0
