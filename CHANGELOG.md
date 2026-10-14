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

[Unreleased]: https://github.com/condoriano98/gilijet/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/condoriano98/gilijet/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/condoriano98/gilijet/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/condoriano98/gilijet/releases/tag/v1.0.0
