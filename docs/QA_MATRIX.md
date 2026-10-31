# QA matrix

The case list for the AI test agents (`.claude/agents/test-generator.md`, `test-triager.md`). Plan: `docs/spikes/in-progress/FEATURE_AI_TEST_AGENT.md`. Run reports: `docs/qa-runs/`.

**Status (2026-10-31):** baseline of the **current** site, run locally on desktop and on a 375 px phone: **354 passed, 0 failed, 8 skipped**; after the redesign stages 0 to 2 and the new specs: **375 passed, 0 failed, 8 skipped**; after the stage 3 baseline specs: **482 passed, 0 failed, 9 skipped** (`docs/qa-runs/2026-10-31-stage-0-2.md`, which also lists what is still not covered) (4 `fixme` for bug B4, 2 opt-in DOKU, 2 conditional); the desktop-only run was 232 / 0 / 6. Reports `docs/qa-runs/2026-10-31-baseline.md`, `2026-10-31-after-b1-b2-b9.md` and `2026-10-31-mobile.md`. Bugs B1, B2 and B9 were fixed after the baseline; their tests are normal tests now. Case IDs start each `test()` title: `AUTH-`, `BOOK-`, `CONT-`, `OPS-`. The operator, admin and API section (4) is a map only: no new specs yet.

Coverage values: `covered-by-existing` (a spec already in the repo), `new-spec` (written 2026-10-31, uncommitted, waiting for the owner's review), `gap-needs-human` (cannot be automated: real payment, real WhatsApp or email delivery, live DOKU, taste), `gap` or `gap-proposed` (could be automated, not written yet).

| Area | File section | Cases | Notes |
|---|---|---|---|
| Auth, lookup, account | 1 | 54 | 49 new specs, 4 need a human |
| Booking flow | 2 | about 65 | 12 covered, 36 new, 11 automatable gaps, 6 need a human |
| Content, home, chrome, legal | 3 | 36 | 24 new, 5 covered, 3 `test.fixme` (app findings), 3 need a human |
| Operator, admin, API | 4 | 92 | map only: 26 covered, 55 gaps, 11 need a human |

Hand edits are fine; the agents read this file first and update it in place.

---

## 1. Auth, lookup, account

Baseline of the **current** site (2026-10-31). Pages: `b/page.tsx`, `account/login`, `account/register`, `account/forgot-password`, `account/reset-password`, `account/page.tsx`. Specs are written, **not yet run** (no database was available: Docker is off and the env points at Supabase, which needs the owner's go).

Viewports: **D** = 1280 (default Playwright desktop), **M** = 375. `375/768/1280` = the case is repeated at all three widths. "Existing" = a spec already in the repo.

Fixtures: every spec creates its own customers, route and bookings (own emails `e2e-*@example.invalid`, own references `E2E-*`, trips in 2090 or 2020) and removes them in `beforeAll` and `afterAll`. Needs `pnpm seed:qa` only for the boat `QA-BOAT-001`. Helpers: `tests/e2e/support/customers.ts`, `tests/e2e/support/overflow.ts`.

| ID | Persona | Page / flow | Steps | Expected result | Viewports | Spec file + test title | Needs human | Coverage |
|---|---|---|---|---|---|---|---|---|
| LOOK-001 | Guest | `/b` lookup | Type a valid reference, click "Look up" | Lands on `/b/<REF>` showing the reference | D | `booking-lookup.spec.ts` · LOOK-001 | n | new-spec |
| LOOK-002 | Guest | `/b` lookup | Type the reference in lower case with spaces around it | Trimmed and upper-cased: same booking page | D | `booking-lookup.spec.ts` · LOOK-002 | n | new-spec |
| LOOK-003 | Guest | `/b/<unknown>` | Open a reference that does not exist | The default "This page could not be found." shows and no booking form. **Status is HTTP 200, not 404** (soft 404, bug B3) | D | `booking-lookup.spec.ts` · LOOK-003 | n | new-spec, passes |
| LOOK-004 | Guest | `/b` lookup | Click "Look up" with the field empty | Stays on `/b`; field is invalid (browser `required`) | D | `booking-lookup.spec.ts` · LOOK-004 | n | new-spec |
| LOOK-005 | Guest | `/b?error=missing` | Open the URL the server redirects to | "Please enter a reference." shown | D | `booking-lookup.spec.ts` · LOOK-005 | n | new-spec |
| LOOK-006 | Guest | login → lookup | On sign-in click "Look up your booking" | Opens `/b` with the reference field | D | `booking-lookup.spec.ts` · LOOK-006 | n | new-spec |
| LOOK-007 | Guest | `/b` no sideways scroll | Open `/b` on a phone | Page is not wider than the viewport | Pixel 5 (393) | `mobile-layout.spec.ts` · find booking | n | covered-by-existing (one width only; 375/768/1280 added by AUTH-070) |
| AUTH-001 | Customer | `/account/login` | Sign in with correct email and password | Lands on `/account`, heading "Hi, <first name>", email shown | D | `auth-login.spec.ts` · AUTH-001 | n | new-spec |
| AUTH-002 | Customer | sign-in with `?next=/b` | Sign in | Redirected to `/b`, not `/account` | D | `auth-login.spec.ts` · AUTH-002 | n | new-spec |
| AUTH-003 | Customer | sign-in, wrong password | Correct email, wrong password | `?error=credentials`, "Wrong email or password."; `/account` still redirects to sign-in | D | `auth-login.spec.ts` · AUTH-003 | n | new-spec |
| AUTH-004 | Customer | sign-in, unknown email | Email with no account | Same generic error (no account enumeration) | D | `auth-login.spec.ts` · AUTH-004 | n | new-spec |
| AUTH-005 | Customer | sign-in validation | Bad email and 5-char password; also open `?error=invalid` | Browser blocks the submit; "Check your email and password." renders | D | `auth-login.spec.ts` · AUTH-005 | n | new-spec |
| AUTH-006 | Customer | sign-in lockout | Five wrong passwords, then the right one | `?error=locked`, "Too many failed attempts…" even with the right password | D | `auth-login.spec.ts` · AUTH-006 | n | new-spec |
| AUTH-007 | Customer | Google-only account | Sign in with any password for an account with no password hash | Generic "Wrong email or password." | D | `auth-login.spec.ts` · AUTH-007 | n | new-spec |
| AUTH-008 | Customer | Google error banners | Open `?error=google_*` for each of 5 codes | Each shows its own message | D | `auth-login.spec.ts` · AUTH-008 | n | new-spec |
| AUTH-009 | Customer | signed-in redirect | Signed in, open `/account/login` and `/account/register` | Both redirect to `/account` | D | `auth-login.spec.ts` · AUTH-009 | n | new-spec |
| AUTH-010 | Customer | "Continue with Google" | Click the Google button, finish at Google | Signed in or linked to the right account | - | - | y: real Google round trip; button only appears when OAuth keys are set | gap-needs-human |
| AUTH-011 | Customer | forgot-password link | Click "Forgot password?" | Opens `/account/forgot-password` | D | `auth-login.spec.ts` · AUTH-011 | n | new-spec |
| AUTH-012 | Customer | create-account link | From `?next=/b` click "Create an account" | `/account/register?next=%2Fb` | D | `auth-login.spec.ts` · AUTH-012 | n | new-spec |
| AUTH-013 | Customer | open-redirect guard | Sign in with `?next=` an absolute, protocol-relative or backslash URL to another site | Customer lands on `/account`, never on the other site | D | `auth-login.spec.ts` · AUTH-013 (3 variants) | n | new-spec, passes. Was `test.fail` until bug B1 was fixed 2026-10-31 |
| AUTH-013b | Customer | `next` still works | Sign in with `?next=/b` | Lands on `/b` | D | `auth-login.spec.ts` · AUTH-013b | n | new-spec, passes |
| AUTH-020 | Visitor | register, happy path | Fill name, mixed-case email, phone, password, tick terms, submit | Signed in on `/account`; row stored with lower-case email, phone, a password hash (not the password) | D | `auth-register.spec.ts` · AUTH-020 | n | new-spec (also covers AUTH-021, email case) |
| AUTH-022 | Visitor | register, duplicate email | Register an email that already has an account | `?error=exists`, message and "Sign in instead" link; still one row | D | `auth-register.spec.ts` · AUTH-022 | n | new-spec |
| AUTH-023 | Visitor | register, terms | Submit without ticking terms; also open `?error=terms` | Browser blocks; no row; "Please accept the Terms and Privacy Policy." renders | D | `auth-register.spec.ts` · AUTH-023 | n | new-spec |
| AUTH-023b | Visitor | register, terms (server) | Untick terms, turn off browser validation, submit | `?error=terms` and the terms message; no row. Was "fill in all required fields" until bug B2 was fixed | D | `auth-register.spec.ts` · AUTH-023b | n | new-spec, passes |
| AUTH-024 | Visitor | register validation | 1-char name and 5-char password; also open `?error=invalid` | Browser blocks; no row; server message renders | D | `auth-register.spec.ts` · AUTH-024 | n | new-spec |
| AUTH-025 | Visitor | register with `next` | Register from `?next=/b` | Ends on `/b` | D | `auth-register.spec.ts` · AUTH-025 | n | new-spec |
| AUTH-025b | Visitor | register with an off-site `next` | Register from `?next=` another site | Lands on `/account` (bug B1) | D | `auth-register.spec.ts` · AUTH-025b | n | new-spec, passes |
| AUTH-026 | Visitor | register, no phone | Leave phone empty | Account created, phone stored as null | D | `auth-register.spec.ts` · AUTH-026 | n | new-spec |
| AUTH-027 | Visitor | register over a Google-only email | Register an email owned by a Google-only account | `?error=exists`; no password added to that account | D | `auth-register.spec.ts` · AUTH-027 | n | new-spec |
| AUTH-030 | Customer | forgot-password, known email | Submit a registered email | `?ok=sent` notice; exactly one unused token that expires in about 1 hour | D | `auth-password-reset.spec.ts` · AUTH-030 | n | new-spec |
| AUTH-031 | Visitor | forgot-password, unknown email | Submit an email with no account | Same notice; no token stored | D | `auth-password-reset.spec.ts` · AUTH-031 | n | new-spec |
| AUTH-032 | Visitor | forgot-password validation | Malformed email; also open `?error=invalid` | Browser blocks; "Please enter a valid email address." renders | D | `auth-password-reset.spec.ts` · AUTH-032 | n | new-spec |
| AUTH-034 | Customer | reset email delivery | Request a reset with real SMTP | Email arrives with a working link | - | - | y: real email delivery; spec file skips when live SMTP keys are set | gap-needs-human |
| AUTH-035 | Visitor | forgot-password abuse | Submit many requests for one email | (None expected today) no rate limit exists on this form | - | - | y: product decision | gap-needs-human (no control in app, see report) |
| AUTH-040 | Customer | reset, valid link | Open link, set matching new password | Lands on `/account?ok=password_changed`, signed in, token marked used, old password rejected, new one works | D | `auth-password-reset.spec.ts` · AUTH-040 | n | new-spec |
| AUTH-041 | Customer | reset, used link | Re-open a link already used | `?error=expired`, "Link expired", "Request a new link" | D | `auth-password-reset.spec.ts` · AUTH-041 | n | new-spec |
| AUTH-042 | Customer | reset, expired link | Link past its hour | "Link expired"; password unchanged | D | `auth-password-reset.spec.ts` · AUTH-042 | n | new-spec |
| AUTH-043 | Visitor | reset, invalid token | Token that was never issued | "Link expired" | D | `auth-password-reset.spec.ts` · AUTH-043 | n | new-spec |
| AUTH-044 | Visitor | reset, no token | Open `/account/reset-password` with no token | Redirects to forgot-password | D | `auth-password-reset.spec.ts` · AUTH-044 | n | new-spec |
| AUTH-045 | Customer | reset, mismatch | New password and confirmation differ | `?error=invalid`, message, token not burnt, token kept in URL | D | `auth-password-reset.spec.ts` · AUTH-045 | n | new-spec (also covers AUTH-046, short password) |
| AUTH-047 | Customer | reset, Google-only account | Set a password through a reset link | Signed in; can later sign in with that password | D | `auth-password-reset.spec.ts` · AUTH-047 | n | new-spec |
| AUTH-050 | Visitor | `/account` signed out | Open `/account` with no session | Redirects to `/account/login` | D | `account.spec.ts` · AUTH-050 | n | new-spec |
| AUTH-051 | Customer | account lists | Sign in with one future and one past booking | "Upcoming trips" and "Booking history" show reference and route; "View" opens `/b/<REF>` | D | `account.spec.ts` · AUTH-051 | n | new-spec |
| AUTH-052 | Customer | guest booking by email | Booking made as a guest with the same email, no customer id | Appears in the account | D | `account.spec.ts` · AUTH-052 | n | new-spec |
| AUTH-053 | Customer | review prompt | Past confirmed booking, no review | One "Rate your trip" link to `/reviews/new?bookingId=…`; none for the future trip | D | `account.spec.ts` · AUTH-053 | n | new-spec |
| AUTH-054 | Customer | empty account | No bookings | "No upcoming trips." with a "Find a boat" link; no history heading | D | `account.spec.ts` · AUTH-054 | n | new-spec |
| AUTH-055 | Customer | profile edit | Change name, phone, nationality, save | `?ok=profile_updated`, new first name in the greeting, values persist after reload and in the row | D | `account.spec.ts` · AUTH-055 | n | new-spec |
| AUTH-056 | Customer | profile, clear phone | Empty the phone field, save | Phone stored as null | D | `account.spec.ts` · AUTH-056 | n | new-spec |
| AUTH-057 | Customer | change password | Wrong current password, then the right one | First: `error=wrong_password`, hash unchanged. Then: `password_changed`, new password works after sign-out | D | `account.spec.ts` · AUTH-057 | n | new-spec |
| AUTH-058 | Customer | change password, short | New password of 5 characters | Browser blocks the submit | D | `account.spec.ts` · AUTH-058 | n | new-spec |
| AUTH-059 | Customer | Google-only account | Open `/account` for an account with no password hash | Google message and a link to forgot-password; no password form | D | `account.spec.ts` · AUTH-059 | n | new-spec |
| AUTH-060 | Customer | sign out | Click "Sign out" | Goes to `/`; `/account` redirects to sign-in again | D | `account.spec.ts` · AUTH-060 | n | new-spec |
| AUTH-070 | Any | no sideways scroll | Open lookup, sign-in (and locked), register, forgot (and sent), reset (and expired), account | Document width not larger than the viewport | 375/768/1280 | `auth-responsive.spec.ts` · AUTH-070 (27 tests) | n | new-spec |
| AUTH-071 | Any | touch targets and layout feel | Use each form on a phone | Controls at least 44 px, spacing comfortable | M | - | y: judgement; thresholds come with the redesign (`DESIGN_SYSTEM.md`) | gap-needs-human |
| AUTH-072 | Any | field labels | Find each field by its label | Every input is reachable by an accessible label | 375/768/1280 | `auth-responsive.spec.ts` · AUTH-072 (inside the AUTH-070 tests) | n | new-spec |
| AUTH-080 | Customer | session cookie | Sign in, inspect cookies | `gilifast_cust` is set, HttpOnly, not SameSite=None, not readable from page script | D | `auth-login.spec.ts` · AUTH-080 | n | new-spec |

#### Counts

- 54 rows: 49 **new-spec**, 1 **covered-by-existing** (LOOK-007), 4 **gap-needs-human** (AUTH-010, AUTH-034, AUTH-035, AUTH-071). Rows folded into another: AUTH-021 and AUTH-046 are covered inside AUTH-020 and AUTH-045 and have no row of their own.
- New spec files: 6 (`booking-lookup`, `auth-login`, `auth-register`, `auth-password-reset`, `account`, `auth-responsive`) and 2 helpers in `support/`. 74 Playwright tests (47 single tests plus the 27 of the AUTH-070 width matrix).

#### Not covered on purpose

- Google OAuth (needs Google), email delivery (needs SMTP), taste and spacing (needs a person).
- Operator and admin sign-in are out of scope for this file.
- Bookings with a round-trip, cancelled or pending status in the account list: the status label mapping is a unit-level concern; only CONFIRMED is built here.

---

## 2. Booking flow

Written 2026-10-31 for `docs/QA_MATRIX.md`. Nothing here was run: no Playwright run, no database (none available locally; Supabase off limits). `pnpm typecheck` and eslint pass on the three new spec files; `tsc -p tests/e2e` shows only the `@next/env` resolution error that every existing spec also shows.

Columns: **Viewports** = where the case matters (`all` = 375/768/1280; the Playwright config runs the `chromium` project at desktop size and only `mobile-layout.spec.ts` under the `mobile` project, so 375 px cases need a `page.setViewportSize` or a mobile project entry). **Coverage**: `covered-by-existing` | `new-spec` (written, not run) | `gap-automatable` (could be written, not yet) | `gap-needs-human`.

#### A. Already covered by existing specs

| ID | Persona | Page / flow | Steps | Expected result | Viewports | Spec + test title | Needs human | Coverage |
|---|---|---|---|---|---|---|---|---|
| BOOK-E01 | Guest | Search → book → checkout (mock) → booking page | Search the route, click Book 1, fill passenger and contact, tick terms, Pay, pay on mock checkout | Lands on `/b/<ref>`, text "confirming your seat", no QR; booking AWAITING_CONFIRMATION, total 120.000, payment SUCCESSFUL, 0 tickets | 1280 | `customer-booking.spec.ts` › anonymous customer can book a departure end-to-end | n | covered-by-existing |
| BOOK-E02 | Guest | Search, round trip fares | One-way search shows one-way fare; round-trip search shows Outbound/Return at half the return fare; picks sum to 340.000 | Prices as described, no 150.000 on round-trip results | 1280 | `round-trip-booking.spec.ts` › search: one way keeps the one-way fare, a round trip shows each leg at half the return fare | n | covered-by-existing |
| BOOK-E03 | Guest | Round-trip book + pay | Pick outbound and return, Continue to Booking, 2 passengers (adult + child), see per-leg lines and total 510.000, pay (mock) | Booking ROUND_TRIP, `legId` null, outbound and return legs set, AWAITING_CONFIRMATION, 2 season snapshots | 1280 | `round-trip-booking.spec.ts` › customer books a round trip, sees each leg priced, and pays on the mock checkout | n | covered-by-existing |
| BOOK-E04 | Guest | Seasonal fares through the form | HIGH and PEAK date: search shows season badge; form button shows season total; submit | Booking PENDING_PAYMENT with season price, snapshot, payment amount equal | 1280 | `seasonal-booking.spec.ts` › HIGH: form total, booking row and payment page agree; › PEAK: … | n | covered-by-existing |
| BOOK-E05 | Guest | OFF day | Search an OFF date; open the leg's book URL | "No departures"; book page "no longer accepting bookings"; 0 bookings | 1280 | `seasonal-booking.spec.ts` › OFF: the departure is hidden and the form is not reachable; `seasonal-pricing.spec.ts` › off: the departure is hidden from search and cannot be booked | n | covered-by-existing |
| BOOK-E06 | Guest | Seasonal price on search and book pages | Per season, search and book page show the same fare | See spec | 1280 | `seasonal-pricing.spec.ts` › `${c.name}: search and book page show ${c.price}` (per season) | n | covered-by-existing |
| BOOK-E07 | Guest | Reschedule date picker | Open reschedule with an open day and an OFF day | Open day lists "Request this"; OFF day says "No departures on this date" | 1280 | `reschedule-season.spec.ts` › the date picker lists an open day and hides the OFF day | n | covered-by-existing |
| BOOK-E08 | Guest | Reschedule server guard | Submit a request for an OFF-day leg by editing the hidden input | Redirect with "Selected departure is unavailable"; no request row | 1280 | `reschedule-season.spec.ts` › a request for an OFF-day departure is refused by the server | n | covered-by-existing |
| BOOK-E09 | Guest | Reschedule happy path | Request an open departure with the booking email | `?ok=reschedule_requested`; request PENDING with the chosen leg | 1280 | `reschedule-season.spec.ts` › a request for an open departure still goes through | n | covered-by-existing |
| BOOK-E10 | Guest | Search page width on a phone | Open `/search?origin=Sanur&destination=Nusa+Penida` at Pixel 5 | No horizontal scroll (no results needed) | 375 | `mobile-layout.spec.ts` › search does not scroll sideways on a phone | n | covered-by-existing |
| BOOK-E11 | Guest | Find-booking page width | `/b` at Pixel 5 | No horizontal scroll | 375 | `mobile-layout.spec.ts` › find booking does not scroll sideways on a phone | n | covered-by-existing |
| BOOK-E12 | Admin | Refund queue | Sign in, open refunds | Pending refund visible | 1280 | `admin-refund.spec.ts` › admin can sign in and find a pending refund in the queue | n | covered-by-existing |

#### B. New specs (written 2026-10-31, not yet run)

### `tests/e2e/booking-search-filters.spec.ts` (fixtures in 2089, read-only)

| ID | Persona | Page / flow | Steps | Expected result | Viewports | Spec + test title | Needs human | Coverage |
|---|---|---|---|---|---|---|---|---|
| BOOK-S01 | Guest | Search sort default | Search a day with 3 departures (08:00 Rp 250.000, 14:00 Rp 400.000, 19:00 Rp 100.000) | Listed by time: 250.000, 400.000, 100.000; times 08:00 and 19:00 shown | 1280 | booking-search-filters › BOOK-S01 default order is by departure time | n | new-spec |
| BOOK-S02 | Guest | Sort by price | Click "Price (low to high)" | URL `sortBy=price`; 100.000, 250.000, 400.000 | 1280 | › BOOK-S02 sort by price lists the cheapest first | n | new-spec |
| BOOK-S03 | Guest | Sort by duration | Click "Duration (shortest)" | URL `sortBy=duration`; 400.000 (45 min), 100.000 (60), 250.000 (90) | 1280 | › BOOK-S03 sort by duration lists the shortest trip first | n | new-spec |
| BOOK-S04 | Guest | Time-slot filter | Click Morning / Afternoon / Evening | Only the departure in that slot (250.000 / 400.000 / 100.000) | 1280 | › BOOK-S04 time slot morning, afternoon, evening (3 tests) | n | new-spec |
| BOOK-S05 | Guest | Max price filter | Type 300000, Apply | URL `maxPrice=300000`; 250.000 and 100.000 only | 1280 | › BOOK-S05 max price filter hides departures above the limit | n | new-spec |
| BOOK-S06 | Guest | Filters match nothing | `maxPrice=50000`; then Clear all | "No departures match your filters"; after Clear all the 3 results return | 1280 | › BOOK-S06 filters that match nothing say so, and Clear all brings the results back | n | new-spec |
| BOOK-S07 | Guest | Empty day | Search a date with no departures | "No departures on this date"; 0 Book links | 1280 | › BOOK-S07 a day with no departures shows the empty state | n | new-spec |
| BOOK-S08 | Guest | Incomplete query | `/search?origin=Sanur`; `/search?destination=…` | Nudge "Pick a destination to see boats from Sanur."; destination-only lists "Boats to …" | 1280 | › BOOK-S08 an incomplete query asks for the missing port instead of failing | n | new-spec |
| BOOK-S09 | Guest | Passengers on the Book link | `passengers=3`, Morning | Link "Book 3 · Rp 750.000" with `passengers=3` in href | 1280 | › BOOK-S09 the passenger count carries into the Book link and its total | n | new-spec |
| BOOK-S11 | Guest | Results page structure after the stage 2 redesign | Open a search with 3 departures at 375 px | exactly one `h1`; the three sort buttons are at least 44 px high | 375 | booking-search-filters.spec.ts · `BOOK-S11 the results page has one h1 and filters that are tall enough to tap` | n | new-spec |
| BOOK-S10 | Guest | Phone width with results | 375 px wide, 3 results listed | No horizontal scroll | 375 | › BOOK-S10 at phone width the results list does not scroll sideways | n | new-spec |

### `tests/e2e/booking-form-validation.spec.ts` (fixtures in 2088 and 2001; skips with live keys)

| ID | Persona | Page / flow | Steps | Expected result | Viewports | Spec + test title | Needs human | Coverage |
|---|---|---|---|---|---|---|---|---|
| BOOK-F01 | Guest | Passenger rows | `/book/<leg>?passengers=3` | 3 name fields (no 4th); button "Pay Rp 300.000" | 1280 | booking-form-validation › BOOK-F01 the passenger count in the link sets the rows and the total | n | new-spec |
| BOOK-F02 | Guest | Add / remove passenger | Add passenger, Remove last | Total 100.000 → 200.000 → 100.000; rows follow | 1280 | › BOOK-F02 adding and removing a passenger moves the total | n | new-spec |
| BOOK-F03 | Guest | Passenger types | 3 passengers: adult, child, infant | Total Rp 150.000 (100.000 + 50.000 + 0) | 1280 | › BOOK-F03 child pays half and an infant pays nothing | n | new-spec |
| BOOK-F04 | Guest | Browser validation | Click Pay on the empty form | Stays on `/book/…`, invalid fields exist, 0 bookings | 1280 | › BOOK-F04 the form stops an empty submit in the browser and creates nothing | n | new-spec |
| BOOK-F05 | Guest | Server: terms | Fill all but terms, turn off browser validation, Pay | `?error=…`, text "Please accept the terms", 0 bookings | 1280 | › BOOK-F05 the server refuses a booking without the terms ticked | n | new-spec |
| BOOK-F05b | Guest | Server: terms message | Same as F05 | The visitor reads "Please accept the terms", not `Expected string, received null` (bug B2, fixed 2026-10-31) | 1280 | › BOOK-F05b the refusal tells the visitor to accept the terms | n | new-spec, passes |
| BOOK-F06 | Guest | Server: email | Email "not-an-email", validation off | Error "Invalid email", 0 bookings | 1280 | › BOOK-F06 the server refuses an invalid email | n | new-spec |
| BOOK-F07 | Guest | Server: passenger name | Passenger "A" (one letter) | Error "Each passenger needs a name", 0 bookings | 1280 | › BOOK-F07 the server refuses a one-letter passenger name | n | new-spec |
| BOOK-F08 | Guest | Server: phone | Phone "1" (→ "+621") | `?error=…`, 0 bookings | 1280 | › BOOK-F08 the server refuses a phone number that is too short | n | new-spec |
| BOOK-F09 | Guest | Promo code | Apply an unknown code | Check ends, price stays Rp 100.000, no "saves" line | 1280 | › BOOK-F09 an unknown promo code is reported next to the field | n | new-spec |
| BOOK-F10 | Guest | Guest note | Open the form signed out | "Booking as a guest" with Sign in (`/account/login?next=`) and create an account (`/account/register?next=`) links | 1280 | › BOOK-F10 a guest is told they are booking as a guest and can sign in | n | new-spec |
| BOOK-F11 | Guest | Closed departure | Open a past departure's book URL | "This departure is no longer accepting bookings." + Search another; no form | 1280 | › BOOK-F11 a departure that has already left cannot be booked | n | new-spec |
| BOOK-F12 | Guest | Unknown leg id | `/book/<bad id>` | The not-found page shows. Status is 200 (soft 404, bug B3) | 1280 | › BOOK-F12 an unknown departure id shows the not-found page, not a crash | n | new-spec, passes |

### `tests/e2e/booking-detail-states.spec.ts` (fixtures in 2087 and 2001; bookings written straight to the DB, never paid; skips with live keys)

| ID | Persona | Page / flow | Steps | Expected result | Viewports | Spec + test title | Needs human | Coverage |
|---|---|---|---|---|---|---|---|---|
| BOOK-D01 | Guest | Detail: PENDING_PAYMENT | Open `/b/<ref>` | Badge "Awaiting payment"; "Complete payment" → `/pay/<ref>`; Cancel booking button; no QR | 1280 | booking-detail-states › BOOK-D01 an unpaid booking offers to finish paying and to cancel | n | new-spec |
| BOOK-D02 | Guest | Detail: AWAITING_CONFIRMATION | Open | Badge "Paid · confirming your seat"; "we're confirming your seat" text; no QR, no PDF link | 1280 | › BOOK-D02 a paid booking says the seat is being confirmed and shows no boarding pass | n | new-spec |
| BOOK-D03 | Guest | Detail: CONFIRMED | Open a booking with 2 tickets | Badge "Confirmed"; "Boarding passes"; 2 QR images; PDF and calendar links to `/api/bookings/<ref>/…`; "Request date change"; Cancel button | 1280 | › BOOK-D03 a confirmed booking shows one QR per passenger… | n | new-spec |
| BOOK-D04 | Guest | Detail: EXPIRED | Open | Badge "Expired"; no Complete payment, no Cancel, no QR | 1280 | › BOOK-D04 an expired booking can neither be paid nor cancelled | n | new-spec |
| BOOK-D05 | Guest | Detail: CANCELLED | Open | Badge "Cancelled"; no Cancel, no Request date change | 1280 | › BOOK-D05 a cancelled booking shows it is cancelled and offers no actions | n | new-spec |
| BOOK-D06 | Guest | Detail: departed | CONFIRMED booking on a 2001 departure | "Confirmed"; no Cancel, no Request date change | 1280 | › BOOK-D06 a confirmed booking whose departure has passed offers no cancel and no reschedule | n | new-spec |
| BOOK-D07 | Guest | Detail: unknown ref | `/b/<bad ref>` | The not-found page shows. Status is 200 (soft 404, bug B3) | 1280 | › BOOK-D07 an unknown reference shows the not-found page | n | new-spec, passes |
| BOOK-D08 | Guest | Cancel: wrong email | Type another email, Cancel booking | `?error=email_mismatch`, "email mismatch"; status unchanged | 1280 | › BOOK-D08 cancelling needs the email on the booking | n | new-spec |
| BOOK-D09 | Guest | Cancel: right email | Type the booking email | `?ok=cancelled`, "Booking cancelled", badge "Cancelled"; DB CANCELLED_BY_CUSTOMER | 1280 | › BOOK-D09 cancelling with the right email cancels the booking | n | new-spec |
| BOOK-D09b | Guest | Cancel an unpaid booking | After D09 on a PENDING_PAYMENT booking | No refund row (bug B9, fixed 2026-10-31) | 1280 | › BOOK-D09b cancelling a booking that was never paid creates no refund | n | new-spec, passes |
| BOOK-D09c | Guest | Cancel a paid booking | Cancel an AWAITING_CONFIRMATION booking with the right email | A PENDING refund for the full amount is queued | 1280 | › BOOK-D09c cancelling a paid booking still queues the refund | n | new-spec, passes |
| BOOK-D10 | Guest | Reschedule: wrong email | Request a date change with another email | `?error=Email does not match booking`; no request row | 1280 | › BOOK-D10 reschedule: another traveller's email is refused | n | new-spec |
| BOOK-D11 | Guest | Reschedule: not confirmed | Open reschedule for an AWAITING_CONFIRMATION booking | Redirected to `/b/<ref>` | 1280 | › BOOK-D11 reschedule: a booking that is not confirmed is sent back to its page | n | new-spec |
| BOOK-D12 | Guest | Pay redirects (mock) | `/pay/<pending>`; `/pay/<confirmed>`; `/pay/<expired>` | Pending → `/checkout/<ref>` with "TEST MODE"; confirmed and expired → `/b/<ref>` | 1280 | › BOOK-D12 pay: a mock-mode booking is sent on to the test checkout, a settled one back to its page | n | new-spec |
| BOOK-D13 | Guest | Checkout redirect | `/checkout/<confirmed>` | Redirected to `/b/<ref>` | 1280 | › BOOK-D13 checkout: a booking that is not waiting for payment is sent back to its page | n | new-spec |
| BOOK-D14 | Guest | Pay / checkout unknown ref | `/pay/<bad>`, `/checkout/<bad>` | HTTP 404 both | 1280 | › BOOK-D14 pay and checkout: an unknown reference is a 404 | n | new-spec |

The `/b` lookup form (find a booking by reference) is covered by `LOOK-001` to `LOOK-006` in `booking-lookup.spec.ts`, written by another worker; not repeated here.

#### C. Gaps

| ID | Persona | Page / flow | Steps | Expected result | Viewports | Spec + test title | Needs human | Coverage |
|---|---|---|---|---|---|---|---|---|
| BOOK-G01 | Guest | Search: round-trip selector with filters | Round-trip search with sort or time slot; pick legs | Filters apply to both legs; Continue to Booking carries both ids | all | (none) | n | new-spec · `booking-search-extras.spec.ts` |
| BOOK-G02 | Guest | Search: connections | Route with a transfer port | "Via connections" card with transfer wait and total; "Book leg 1 first" opens leg 1 | all | (none) | n | new-spec · `booking-search-extras.spec.ts` (B16 `test.fail`) |
| BOOK-G03 | Guest | Search: sea-condition badge | Route with a known sea condition | Badge shows the condition | all | (none) | n | new-spec · `booking-search-extras.spec.ts` (B15 `test.fail`) |
| BOOK-G04 | Logged-in customer | Book form prefill | Sign in, open the form | Name, email, phone and nationality prefilled; "Booking as <name>"; booking linked to the account | all | (none; needs a customer fixture, see `support/customers.ts`) | n | new-spec · `booking-form-extras.spec.ts` |
| BOOK-G05 | Guest | Book: round-trip form validation | Same checks as F04 to F08 on `/book/0?outboundLegId=…&returnLegId=…` | Same errors; error redirect keeps both leg ids | all | (none) | n | new-spec · `booking-form-extras.spec.ts` |
| BOOK-G06 | Guest | Book: valid promo code | Create a promo, apply it | "saves Rp …" line; total reduced; booking `discountAmount` set | all | (none; needs a promotion fixture) | n | new-spec · `booking-form-extras.spec.ts` (B17 `test.fail`) |
| BOOK-G07 | Guest | Checkout: failed payment state | `/checkout/<pending>?failed=1` | Failure notice, retry path, booking still PENDING_PAYMENT | all | (none) | n | new-spec · `booking-checkout-detail.spec.ts` |
| BOOK-G08 | Guest | Pay page: gateway error banner | `/pay/<ref>?error=gateway` with live-mode flags | Banner "gateway" shown, no redirect loop | all | (none; the mock mode redirects before this view renders) | y: needs non-mock env | gap-needs-human |
| BOOK-G09 | Guest | Booking detail: round-trip | Open a round-trip booking | Both legs shown, per-leg status, return leg label | all | (none) | n | new-spec · `booking-checkout-detail.spec.ts` (B18 `test.fail`) |
| BOOK-G10 | Guest | Booking detail: refund preview | Cancel at each tier (more than 7 days, 3 to 6 days, under 3 days) | Description and refund amount match `refunds.ts` tiers | all | (none; needs fixtures with legs at set offsets from now, which age) | n | new-spec · `booking-checkout-detail.spec.ts` |
| BOOK-G11 | Guest | Booking detail: "Already requested" | Booking with a PENDING reschedule request | "Reschedule request pending operator review", no button | all | (none) | n | new-spec · `booking-checkout-detail.spec.ts` |
| BOOK-G12 | Guest | Booking detail: print / PDF | Click Boarding pass PDF | PDF opens and contains the QR and booking reference | all | (none) | y: PDF rendering and print layout are a visual check | gap-needs-human |
| BOOK-G13 | Guest | Real payment (DOKU Checkout, QRIS, cards, e-wallets) | Pay with a real method | DOKU notification flips the booking to AWAITING_CONFIRMATION; page updates without refresh | all | `doku-one-rupiah.spec.ts` is opt-in and stops before paying | y: real money and a real gateway | gap-needs-human |
| BOOK-G14 | Guest | PayPal | Approve a PayPal order | Capture on return, booking updated | all | (none) | y: real PayPal account | gap-needs-human |
| BOOK-G15 | Guest | WhatsApp and email after payment and after confirmation | Pay, then have an admin confirm | Customer and PIC messages arrive with the right content and order of template parameters | all | `eticket-pic.spec.ts` covers the call, not delivery | y: needs a real phone and mailbox | gap-needs-human |
| BOOK-G16 | Guest | Locale pages | Open search and book under `/id`, `/ja`, `/zh` | Pages render with translated strings, prices still in Rp | all | (none) | y: reading the translations | gap-needs-human |
| BOOK-G17 | Guest | Layout at 375, 768, 1280 on book, detail, checkout | Open each page | No horizontal scroll; primary button reachable | 375, 768 | `mobile-layout.spec.ts` covers search and `/b` only | n | new-spec · `booking-layout-first-visit.spec.ts` |
| BOOK-G18 to G23 | Guest | Stage 3 baseline: first visit (banner open) on book, checkout, pay and booking detail at 1280x720 and 375x812; the 44 px floor on those pages | see spec | main controls receive a tap; known failures are `test.fail` with B12, B13, B19 | 375, 1280 | `booking-layout-first-visit.spec.ts` (44 tests, 1 skipped) and `booking-checkout-detail.spec.ts` (BOOK-G18) | n | new-spec |

#### D. Counts

- Already covered by existing specs: 12 cases (BOOK-E01 to E12).
- New specs written: 36 cases in 3 files, 38 Playwright tests (BOOK-S04 expands to 3 tests): search 10 cases, form 12 cases, detail and reschedule and pay redirects 14 cases.
- Gaps: 17 listed (BOOK-G01 to G17): 11 automatable (G01 to G07, G09 to G11, G17) and 6 needing a human (G08, G12 to G16).

#### E. Findings while reading the code (not verified by running)

1. **Search max-price filter reading `leg.basePrice`: ruled out 2026-10-31.** `search/page.tsx` runs `withSeasonPrice(...)` before filtering and sorting, and that helper replaces `basePrice` with the seasonal adult fare (locked by `tests/unit/features/pricing/seasons.test.ts`). No e2e covers the filter on a PEAK leg.
2. **Cancelling an unpaid booking created a refund: confirmed by BOOK-D09b and fixed 2026-10-31** (`b/[reference]/page.tsx`: a PENDING_PAYMENT booking owes nothing back). BOOK-D09c guards the paid side. Operator-rejection and admin cancel paths were not checked for the same pattern.
3. **No capacity check.** `engine.ts` states a departure is bookable as long as it is OPEN; no seat limit applies, so there is no "sold out" case to test.
4. **Missing test ids:** none needed so far; the specs use ids already on the form (`#passengerName-0`, `#customerName`, `#customerEmail`, `#passengerType-n`, `#promoCode`, `#reference`), labels and roles. Candidates if selectors turn brittle during the redesign: a `data-testid` on the per-departure card on search, on the status badge on `/b/<ref>`, and on the error banner (`bg-red-50` paragraph) on the book page, which now can only be found by its text.

---

## 2b. Phone width (375 px)

Added 2026-10-31. Report: `docs/qa-runs/2026-10-31-mobile.md`. The booking, lookup, search, form, detail and home-search specs also run on a phone through the Playwright project `mobile-flow`; these cases add the layout checks.

| ID | Persona | Page/flow | Steps | Expected result | Viewports | Spec file + test title | Needs human | Coverage |
|---|---|---|---|---|---|---|---|---|
| MOB-001 | Guest | 15 data-free pages | Open each | No sideways scroll | 375 (and 1280) | `mobile-sweep.spec.ts` · MOB-001 | n | new-spec, passes |
| MOB-002 | Guest | the same pages | Scroll each enabled submit button into view | The button itself receives a tap at its centre; nothing sticky or overlapping covers it | 375 (and 1280) | `mobile-sweep.spec.ts` · MOB-002 | n | new-spec, passes |
| MOB-003 | Visitor | consent banner | Open `/about` with no consent cookie | The banner leaves at least half the screen | 375 | `mobile-sweep.spec.ts` · MOB-003 | n | new-spec, skips when marketing is off |
| MOB-004 | Guest | redesigned pages | Submit buttons are at least 44 px high | The redesign's standard (bug B13) | 375 | `mobile-sweep.spec.ts` · MOB-004, only for routes in `REDESIGNED_ROUTES` (`/` since stage 1) | n | new-spec, guarding the redesigned routes |
| BOOK-M01 | Guest | booking form | Open with 2 passengers | No sideways scroll; Pay reachable | 375 (and 1280) | `booking-form-validation.spec.ts` · BOOK-M01 | n | new-spec, passes |
| BOOK-M02 | Guest | booking page, 3 statuses | Open each | No sideways scroll; buttons reachable | 375 (and 1280) | `booking-detail-states.spec.ts` · BOOK-M02 | n | new-spec, **expected failure on a phone (bug B12: 391 px wide)** |
| BOOK-M03 | Guest | results page | Open a search with results | No sideways scroll | 375 (and 1280) | `booking-search-filters.spec.ts` · BOOK-M03 | n | new-spec, passes |

---

## 3. Content, home, chrome, legal

Source: code read 2026-10-30. Specs not run (no database available; Docker not running). `seed:qa` is required for CONT-015 to CONT-018 (ports come from schedules).
Coverage values: `covered-by-existing`, `new-spec`, `gap-needs-human`, `gap-app-finding` (spec written as `test.fixme` so the suite stays green and the finding stays visible), `gap-fixture` (needs a customer/booking fixture; not written yet).
Default viewport for chromium project is 1280; "375" cases set the viewport inside the spec.

| ID | Persona | Page / flow | Steps | Expected result | Viewports | Spec file + test title | Needs human | Coverage |
|---|---|---|---|---|---|---|---|---|
| CONT-001 | anonymous | 12 content routes (/, /about, /contact, /blog, /blog/wahana-virendra-checkin-guide, /best-price-guarantee, /terms, /privacy, /refunds, /change-plans, /b, /legal/wahana-virendra) | GET each | HTTP 200; header visible | 1280 | content-pages.spec.ts · `CONT-001 <route> returns 200` | n | new-spec |
| CONT-002 | anonymous | same routes except /legal | Load, count `h1` | exactly one `h1` | 1280 | content-pages.spec.ts · `CONT-002 <route> has one h1` | n | new-spec |
| CONT-002b | anonymous | /best-price-guarantee | Load, count `h1` | exactly one `h1` | 1280 | content-pages.spec.ts · `CONT-002b best-price-guarantee has one h1` | n | gap-app-finding: the title is a `CardTitle` (h3), no h1 |
| CONT-003 | anonymous | page titles | Load each route | `<title>` = page title + ` · Gilifast` once (home and /about and /refunds already in tab-branding) | 1280 | content-pages.spec.ts · `CONT-003 <route> title` ; tab-branding.spec.ts | n | new-spec (contact, blog, terms, privacy, change-plans) + covered-by-existing (/, /about, /refunds) |
| CONT-003b | anonymous | /best-price-guarantee | Load | own title `Best Price Guarantee · Gilifast` | 1280 | content-pages.spec.ts · `CONT-003b best-price-guarantee has its own title` | n | gap-app-finding: page exports no `metadata`, falls back to the default tab title |
| CONT-004 | anonymous | no sideways scroll on a phone: /, /blog, /contact, /search, /b | Load at 375 | `scrollWidth <= clientWidth` | 375 | mobile-layout.spec.ts | n | covered-by-existing |
| CONT-005 | anonymous | no sideways scroll on a phone: /about, /best-price-guarantee, /terms, /privacy, /refunds, /change-plans | Load at 375 | `scrollWidth <= clientWidth` (names widest element on failure) | 375 | content-pages.spec.ts · `CONT-005 <route> does not scroll sideways at 375` | n | new-spec |
| CONT-006 | anonymous | guide: blog index links it, 7 harbours, Maps links, no overflow | see spec | as spec | 1280 / 393 | blog-checkin-guide.spec.ts | n | covered-by-existing |
| CONT-007 | anonymous | header desktop | Load /, read header links | Blog, Find booking, Book now present and each target returns < 400 | 1280 | site-chrome.spec.ts · `CONT-007 header links resolve` | n | new-spec |
| CONT-008 | anonymous | header mobile menu | Open menu | Find booking, Blog, Sign in reachable | 375 (Pixel 5) | mobile-layout.spec.ts · `the mobile menu reaches the links the header hides` | n | covered-by-existing |
| CONT-009 | anonymous | footer | Load /, read every internal footer link | each returns < 400 (About, Contact, Blog, For operators, Terms, Privacy, Refund, Wahana terms, Find my booking, Change or refund) | 1280 | site-chrome.spec.ts · `CONT-009 footer links resolve` | n | new-spec |
| CONT-009b | anonymous | footer chrome after the stage 0 redesign | Load /about | footer has the Cookie settings button, Payment Partners and the DOKU line; header sits at the top (no bar above it) | 1280 | site-chrome.spec.ts · `CONT-009b footer keeps cookie settings and payment partners; no utility bar above the header` | n | new-spec |
| CONT-010 | anonymous | contact links in the footer (the utility bar was removed in the stage 0 redesign) | Load /about | WhatsApp link `https://wa.me/628133399869`, mailto `info@balinusafast.com` | 1280 | site-chrome.spec.ts · `CONT-010 WhatsApp and email links` | y: that the number and mailbox are still the right ones | new-spec |
| CONT-011 | anonymous | consent banner: default, accept, reject, footer reopens | see spec | as spec | 1280 | marketing-consent.spec.ts (5 tests) | n | covered-by-existing |
| CONT-012 | anonymous | consent banner hidden once a choice exists | Load / with the default storage state | `consent-banner` not visible | 1280 | site-chrome.spec.ts · `CONT-012 banner stays hidden after a choice` | n | new-spec |
| CONT-013 | anonymous | unknown URL | GET /this-page-does-not-exist | HTTP 404 | 1280 | site-chrome.spec.ts · `CONT-013 unknown path is 404` | y: the 404 page has no branded design (no `not-found.tsx`) | new-spec |
| CONT-014 | anonymous | invalid locale prefix | GET /fr/about | HTTP 404 | 1280 | site-chrome.spec.ts · `CONT-014 unknown locale is 404` | n | new-spec |
| CONT-015 | anonymous | locale prefixes render the same page | GET /id/about, /zh/about, /ja/about, /en/about | 200 and About h1 visible | 1280 | site-chrome.spec.ts · `CONT-015 <locale>/about renders` | y: translated copy is not checked (customer pages are mostly English literals) | new-spec |
| CONT-016 | anonymous | locale switcher keeps the path | no control exists: the old blue utility bar showed a static "English"; the bar is gone since stage 0 | n/a | n/a | none | y | gap-needs-human: feature absent; decide in the redesign |
| CONT-017 | anonymous | home hero | Load / | one `h1` ("Let Journey Begin with Gilifast!") and the subtitle | 1280 | home-search.spec.ts · `CONT-017 hero heading and search form render` | n | new-spec |
| CONT-018 | anonymous | home search submits | Pick From = Sanur, To = Nusa Penida, 2 passengers, Search | URL `/search` with `origin=Sanur&destination=Nusa+Penida&passengers=2&date=<field value>` | 1280 | home-search.spec.ts · `CONT-018 search form submits to /search with its params` | n | new-spec (needs `seed:qa` ports) |
| CONT-019 | anonymous | home search validation | Press Search with no destination | stays on `/` | 1280 | home-search.spec.ts · `CONT-019 search without a destination does nothing` | n | new-spec |
| CONT-020 | anonymous | swap button | Pick both ports, press swap | the two selections trade places | 1280 | home-search.spec.ts · `CONT-020 swap exchanges the ports` | n | new-spec |
| CONT-021 | anonymous | return trip field | Press "Return" | a "Return:" field appears; "One way" hides it | 1280 | home-search.spec.ts · `CONT-021 Return reveals the return date` | n | new-spec |
| CONT-022 | anonymous | home DB-backed blocks (departing soon, popular routes, reviews, trust) | Load / | page renders, no error boundary ("Something went wrong") | 1280 | home-search.spec.ts · `CONT-022 home renders without the error boundary` | y: whether the numbers and cards shown are correct | new-spec (renders only) |
| CONT-023 | anonymous | trust numbers appear only above thresholds | needs controlled data | `TRUST_THRESHOLDS` honoured | n/a | none | n | gap-fixture |
| CONT-024 | anonymous | refund tiers on /refunds follow the constants | Read `REFUND_CUTOFF_HOURS` and `FULL_REFUND_WINDOW_HOURS`, load /refunds | page text contains `${cutoff} hours`, `>${full} hours` and `${full/24} days` | 1280 | refund-policy-text.spec.ts · `CONT-024 /refunds tier text matches the constants` | n | new-spec (the page types 48 / 168 / 7 by hand today, so this guards drift) |
| CONT-025 | anonymous | refund tiers on /change-plans follow the constants | same | text contains `${cutoff} hours`/`${cutoff} hrs`, `>${full} hrs`, `${full/24} days` | 1280 | refund-policy-text.spec.ts · `CONT-025 /change-plans tier text matches the constants` | n | new-spec |
| CONT-026 | anonymous | tier percentages (100 % / 50 % / not available) | compare with `refunds.ts` fraction table | match | n/a | unit tests (not e2e) | n | out of scope here |
| CONT-027 | anonymous | terms and privacy structure | Load | terms has 15 numbered `h2` sections; privacy has numbered `h2` sections starting "1. Data We Collect" | 1280 | content-pages.spec.ts · `CONT-027 terms and privacy keep their numbered sections` | y: legal wording | new-spec |
| CONT-028 | anonymous | in-page anchors on terms/privacy | none exist today (no `id`) | n/a | n/a | none | n | gap-app-finding: a table of contents (redesign) needs section ids |
| CONT-029 | anonymous | /reviews/new without login | GET with and without `bookingId` | redirect to `/account/login` | 1280 | review-new.spec.ts · `CONT-029 anonymous visitor is sent to login` | n | new-spec |
| CONT-030 | logged-in customer | /reviews/new error redirects (booking_missing, not_your_booking, not_confirmed, trip_not_finished, already_reviewed) and the happy path | needs a customer and bookings | `/account?error=...` | 1280 | none yet | n | gap-fixture (deferred: needs a customer account fixture helper) |
| CONT-031 | anonymous | About, Contact, Blog index copy and layout | read | correct and pleasant | all | none | y: wording and look | gap-needs-human |
| CONT-032 | anonymous | text contrast, spacing, image quality | look | AA contrast, no clipping | all | none | y | gap-needs-human |
| CONT-033 | anonymous | From and To dropdowns open and offer the same ports (home, /search, /id; laptop and phone) | Open the page, open From, then To | both open; each lists ports; the two lists are equal; Sanur and Nusa Penida are in them | 1280, 375 | search-form-ports.spec.ts · `CONT-033 <page> at <size>: From and To open and list the same ports` (6 tests) | n | new-spec |
| CONT-034 | anonymous | /search form: picking From fills it | Open /search, pick Sanur in From | From shows Sanur, To keeps Nusa Penida | 1280 | search-form-ports.spec.ts · `CONT-034 /search: picking a port in From and To fills both fields` | n | new-spec |
| CONT-035 | first-time visitor | consent banner open: From and To are reachable when the page opens | Open the page with no saved choice | the centre of each field is the field itself, not the banner | 1280x720, 375x812 | search-form-ports.spec.ts · `CONT-035 <page> at <size>: the banner does not cover From or To when the page opens` (6 tests) | n | new-spec (B14, fixed 2026-10-31) |
| CONT-036 | first-time visitor | the form works once the banner is answered | Phone, click "Essential only", open To | banner gone, To opens | 375 | search-form-ports.spec.ts · `CONT-036 the form still works after the banner is answered` | n | new-spec |

---

## 4. Operator, admin, API

Map of what exists today (2026-10-30). Source: `src/app/operator/**`, `src/app/admin/**`, `src/app/api/**`, the specs under `tests/e2e/`, and the guards in the code. No new spec was written and nothing was run.

**How to read it**
- **Coverage:** `covered-by-existing` = an e2e spec in `tests/e2e/` exercises it (spec and test title cited). `gap-proposed` = no e2e spec; an automated one is possible. `gap-needs-human` = cannot be fully automated (real money, real delivery, camera, phone call, external API credentials).
- "unit:" in the spec column means a unit test touches the logic. It does not count as e2e coverage; it only lowers the risk of the gap.
- **Persona:** operator, admin (`requireAdmin`), super-admin (`requireSuperAdmin`), system (cron, webhook, no session).
- Only the `tests/e2e/` specs named in the brief were treated as coverage. `customer-booking`, `reschedule-season` and the other customer specs were not read for this map; where they may touch an admin action it says so.

#### Facts found in the code that shape the matrix

1. `src/app/operator/layout.tsx` renders its children **when there is no session** (`if (!session) return <>{children}</>`). So the guard lives in each page. A new operator page without `requireOperator()` would be public. Every operator page and action I checked has a guard; the only guard-less page files are 6 pure redirects (`operator/armada`, `operator/operasi/jadwal|keberangkatan|pemindai`, `admin/promos`, `admin/promos/new`).
2. `src/app/admin/(authed)/layout.tsx` redirects to `/admin/login` without a session. `operations/` and `console/` layouts call `requireSuperAdmin`; most other admin pages call `requireAdmin`. `diagnostics` and `console/*` need super admin.
3. All 8 cron routes check `Bearer ${CRON_SECRET}` and answer 401. Only `poll-operator-inbox` is checked in e2e.
4. `/api/operator/*` routes use `getOperatorSession` or `requireOperator` (401 when absent). `/api/admin/marketing/*` use `superAdminOrResponse`. `/api/admin/bookings/csv` uses `getAdminSession`.
5. `/api/mcp` is a Bearer endpoint (`MCP_REVIEWER_TOKEN`, 503 when unset, 401 on a bad token).
6. `/api/bookings/[reference]/boarding-pass` and `/ics` are unauthenticated by design (the reference is the credential); the pass returns 404 unless the booking is `CONFIRMED`.
7. The `operator-manifest` spec opens a leg only `if (await firstLeg.isVisible())`, so it can pass without checking a manifest.
8. `admin-webhooks.spec.ts` states the DOKU webhook "fails closed with 401" in e2e (no live keys), so payment processing is covered by unit tests, not e2e.
9. Specs that skip without env: `eticket-pic` (needs `WHATSAPP_TEMPLATE_ORDER_NOTIF`), `eticket-operator-email` (needs `CRON_SECRET`), `whatsapp-webhook` (needs verify token and app secret).

#### A. Access control (always include)

| ID | Persona | Page/flow | Steps | Expected result | Spec file + test title | Needs human | Coverage |
|---|---|---|---|---|---|---|---|
| OPS-001 | operator | Operator pages without a session | Open each `/operator/*` page (dashboard, boats, schedules, legs, scanner, pos, kas, penjualan, laporan, pajak, penggajian, akuntansi, pengaturan, awak, armada subpages) with no cookie | Redirect to `/operator/login`; no page content | none | n | gap-proposed |
| OPS-002 | operator | Operator API routes without a session | Call `/api/operator/checkin`, `pos/sale`, `document-upload`, `manifest/<id>`, `manifest/<id>/csv`, `reports/<kind>/csv`, `tax/<period>/csv` with no cookie | 401 (or redirect for `requireOperator` routes); no data returned | none; unit: `tests/unit/app/api/operator/manifest.test.ts` | n | gap-proposed |
| OPS-003 | operator | Tenant scoping, page | Log in as operator A; open `/operator/legs/<leg of operator B>`, `/operator/schedules/<B>`, `/operator/boats/<B>` | Not found or redirect; none of B's data shown | none | n | gap-proposed |
| OPS-004 | operator | Tenant scoping, lists | Operator A opens `/operator/legs`, `/boats`, `/schedules`, `/penjualan`, `/kas` while B has rows | Only A's rows appear | none; unit: `tests/unit/shared/server/auth.test.ts` (`operatorScope` shape) | n | gap-proposed |
| OPS-005 | operator | Tenant scoping, API | Operator A calls `/api/operator/manifest/<B's legId>` and its `/csv`, and `/api/operator/checkin` with B's `legId` | 404 or refusal; no passenger data; no check-in | none; unit: `tests/unit/app/api/operator/manifest.test.ts` | n | gap-proposed |
| OPS-006 | admin | Admin pages without a session | Open every `/admin/*` page with no cookie (bookings, refunds, confirmations, reschedules, webhooks, eticket-delivery, operators, dashboard) | Redirect to `/admin/login` | `admin-seasons.spec.ts` › "the Seasons tab is not reachable without an admin session" (only `/admin/console/seasons`); `admin-diagnostics.spec.ts` › "diagnostics is not reachable without an admin session" (only `/admin/diagnostics`) | n | gap-proposed (2 of about 30 pages covered) |
| OPS-007 | admin | Plain admin blocked from super-admin areas | Log in as a non-super admin; open `/admin/console/*`, `/admin/operations/*`, `/admin/diagnostics` | Redirect or refusal, never the page | none (the specs only log in as super admin) | n | gap-proposed |
| OPS-008 | super-admin | Destructive op needs super admin | As plain admin, invoke `deleteOperatorAction`, season delete, schedule delete | Refused; nothing deleted | none | n | gap-proposed |
| OPS-009 | super-admin | Operator hard-delete guard | As super admin, delete an operator whose subtree has a Payment, Refund or Ticket | Refused with a message; no rows erased | none | n | gap-proposed |
| OPS-010 | system | Cron routes reject missing or wrong secret | For each of the 8 `/api/cron/*` routes: no header, wrong Bearer, right Bearer | 401, 401, 200 | `eticket-operator-email.spec.ts` › "the poll route refuses a missing or wrong secret" (only `poll-operator-inbox`); unit: `tests/unit/app/api/cron/retry-webhooks.test.ts` | n | gap-proposed (1 of 8 in e2e) |
| OPS-011 | system | Webhook signatures: DOKU | POST `/api/webhooks/doku` unsigned and with a wrong signature | 401; a `WebhookEvent` "Invalid signature" row; no payment recorded | none in e2e; unit: `tests/unit/features/payments/doku-signature.test.ts`. The "rejected" tab view is covered by `admin-webhooks.spec.ts` › "the webhook log lists events, filters them and retries a failed one" | n | gap-proposed |
| OPS-012 | system | Webhook signatures: PayPal | POST `/api/webhooks/paypal` unsigned and with a wrong signature | Rejected; nothing recorded | none; unit: `tests/unit/features/payments/paypal.test.ts` | n | gap-proposed |
| OPS-013 | system | Webhook signatures: WhatsApp | GET verify with right and wrong token; POST unsigned and wrongly signed | Right token returns the challenge, wrong 403; unsigned and bad signature 401 | `whatsapp-webhook.spec.ts` › "Meta verification: the right token gets the challenge back, a wrong one is refused"; › "an unsigned or wrongly signed delivery is refused" | n | covered-by-existing (skips without env) |
| OPS-014 | system | Admin marketing APIs need super admin | Call each of the 5 `/api/admin/marketing/*` routes as anonymous, as plain admin, as super admin | 401 or 403, 403, success | none | n | gap-proposed |
| OPS-015 | system | MCP endpoint token | Call `/api/mcp` with no token, a wrong token, with `MCP_REVIEWER_TOKEN` unset | 401, 401, 503; never returns booking data | none | n | gap-proposed |
| OPS-016 | admin | Admin bookings CSV without a session | GET `/api/admin/bookings/csv` with no cookie | 401, no rows | none | n | gap-proposed |

#### B. Operator surface

| ID | Persona | Page/flow | Steps | Expected result | Spec file + test title | Needs human | Coverage |
|---|---|---|---|---|---|---|---|
| OPS-020 | operator | Login, success | `/operator/login`, correct email and password | Lands under `/operator`, dashboard text shown | `operator-manifest.spec.ts` › "operator can log in and view a leg manifest" | n | covered-by-existing |
| OPS-021 | operator | Login, failure | Wrong password; unknown email; empty fields | Error message, no session, stays on login | none | n | gap-proposed |
| OPS-022 | operator | Leg list and manifest view | `/operator/legs`, open a leg | Manifest shows passengers, tickets, seats | `operator-manifest.spec.ts` › "operator can log in and view a leg manifest". **Weak:** the leg is opened only if a link is visible, so the test can pass without checking a manifest | n | covered-by-existing (weak) |
| OPS-023 | operator | Manifest CSV | Open `/api/operator/manifest/<legId>/csv` as the owning operator | CSV with one row per passenger, scoped to the operator | none; unit: `tests/unit/app/api/operator/manifest.test.ts` | n | gap-proposed |
| OPS-024 | operator | Check-in via API | POST `/api/operator/checkin` with a valid QR for this leg, again (repeat), a wrong leg, a tampered QR | First: checked in. Repeat: already checked in. Wrong leg and tampered QR: refused | none | n (camera not needed for the API) | gap-proposed |
| OPS-025 | operator | Scanner page | `/operator/scanner`; type a ticket code manually | Page renders; manual entry resolves the ticket. Camera prompt is gated | none | y (camera permission and real scanning) | gap-needs-human (manual entry part is automatable) |
| OPS-026 | operator | POS sale | `/operator/pos`, sell seats; POST `/api/operator/pos/sale` | Booking created through the engine, price from `computeBookingPrice`, seats held; zero passengers returns 400 | none | n | gap-proposed |
| OPS-027 | operator | Create boat | `/operator/boats/new`, submit; open the list | Boat saved with the operator's id; appears in the list; soft-deleted boats hidden | none | n | gap-proposed |
| OPS-028 | operator | Create schedule | `/operator/schedules/new`, submit | Schedule saved; legs generated per port stop (`generateLegsForSchedule`); legs visible in `/operator/legs` | none | n | gap-proposed |
| OPS-029 | operator | Edit schedule or leg | `/operator/schedules/[id]`, `/operator/legs/[id]` actions (price, status, cancel) | Change saved; customers keep the right fare (seasonal rules respected) | none | n | gap-proposed |
| OPS-030 | operator | Open and close a cash shift | `/operator/kas`; `openShift`, `closeShift` | Shift opens once; closing records totals; cannot open two | none | n | gap-proposed |
| OPS-031 | operator | Reconciliation note and settlements | `/operator/kas/rekonsiliasi`, `/operator/kas/penyelesaian` | Note saved; list renders scoped to the operator | none | n | gap-proposed |
| OPS-032 | operator | Sales, agents, agent payout | `/operator/penjualan`, `/penjualan/agen`, `/penjualan/agen/[id]` and `markAgentPayoutPaid` | Lists scoped to the operator; payout marked paid once | none | y for the real bank transfer; the status change is automatable | gap-proposed |
| OPS-033 | operator | Operator refund view | `/operator/penjualan/refund` | Lists only this operator's refunds | none | n | gap-proposed |
| OPS-034 | operator | E-faktur transition | `/operator/akuntansi`, `transitionEFaktur` | Allowed state changes only | none | y for the real tax-portal upload; the transition is automatable | gap-proposed |
| OPS-035 | operator | Payroll lock | `/operator/penggajian`, `lockPeriod` | Period locks; locked period cannot be edited | none | n | gap-proposed |
| OPS-036 | operator | Reports, tax CSV | `/operator/laporan`, `/operator/pajak`; `/api/operator/reports/<kind>/csv`, `/api/operator/tax/<period>/csv` | CSVs scoped to the operator, correct headers | none | n | gap-proposed |
| OPS-037 | operator | Settings profile | `/operator/pengaturan`, `updateProfile` | Saved; validation errors shown | none | n | gap-proposed |
| OPS-038 | operator | Operator sign-up | `/operator/daftar`, `createOperatorAccount`, `submitBankAccount` | Account created pending approval; bank details stored | none | y (bank account verification, admin approval) | gap-needs-human |
| OPS-039 | operator | Document upload | POST `/api/operator/document-upload` valid file, wrong type, too large | Accepted, refused, refused; the operator comes from the session, never from the request | none | n | gap-proposed |
| OPS-040 | operator | Fleet and crew pages | `/operator/armada/*` (fuel, maintenance, certificates), `/operator/awak/*` (crew, roster, certification) | Render; scoped to the operator | none | n | gap-proposed |
| OPS-041 | operator | Redirect aliases | `/operator/armada`, `/operator/operasi/jadwal`, `/operator/operasi/keberangkatan`, `/operator/operasi/pemindai` | Redirect to boats, schedules, legs, scanner; guard applies at the destination | none | n | gap-proposed |

#### C. Admin surface

| ID | Persona | Page/flow | Steps | Expected result | Spec file + test title | Needs human | Coverage |
|---|---|---|---|---|---|---|---|
| OPS-050 | admin | Login, success | `/admin/login`, correct credentials | Leaves the login page | `admin-refund.spec.ts` › "admin can sign in and find a pending refund in the queue" (and used by every admin spec) | n | covered-by-existing |
| OPS-051 | admin | Login, failure | Wrong password; unknown email | Error, no session | none | n | gap-proposed |
| OPS-052 | admin | Bookings list, paid label | `/admin/bookings` after a payment | Paid booking labelled paid | `admin-webhooks.spec.ts` › "a paid booking is labelled as paid in the admin bookings list" | n | covered-by-existing |
| OPS-053 | admin | Bookings list live refresh | Change a booking status while the list is open | List updates without a reload | `admin-webhooks.spec.ts` › "the bookings list picks up a status change without a reload" | n | covered-by-existing |
| OPS-054 | admin | Bookings filters | Trip Type filter with other filters set | List narrows; other filters kept | `admin-bookings-filter.spec.ts` › "the Trip Type filter narrows the list and keeps the other filters" | n | covered-by-existing |
| OPS-055 | admin | Bookings CSV | Export with filters | CSV matches the filters exactly | `admin-bookings-filter.spec.ts` › "the CSV export contains exactly what the filters select" | n | covered-by-existing |
| OPS-056 | admin | Passengers column | Booking with no tickets yet | Counts passengers from the booking | `admin-bookings-filter.spec.ts` › "the Passengers column counts the passengers on a booking that has no tickets yet" | n | covered-by-existing |
| OPS-057 | admin | Refund queue | `/admin/refunds?filter=pending` | Pending refund listed; viewing does not approve | `admin-refund.spec.ts` › "admin can sign in and find a pending refund in the queue" | n | covered-by-existing |
| OPS-058 | admin | Approve a refund | Approve a pending refund | Status changes to approved once, amount follows `refunds.ts` tiers, audit logged, customer notified | none | n | gap-proposed |
| OPS-059 | admin | Reject a refund | Reject with a reason | Status rejected; reason kept; no money state change | none | n | gap-proposed |
| OPS-060 | admin | Mark money returned | "Mark money returned" on an approved refund | Refund becomes completed once; marketing `refund` event recorded when enabled | none | y (the actual bank or gateway transfer) | gap-needs-human (status change automatable) |
| OPS-061 | admin | Confirmations queue | `/admin/confirmations` with a booking in `AWAITING_CONFIRMATION`; confirm | Booking becomes confirmed; `issueTicketsForBooking` mints tickets; customer notified | none | y (the confirming phone call to the operator) | gap-needs-human (the confirm action is automatable) |
| OPS-062 | admin | Payment to ticket gate | Pay a booking, then check tickets before and after the admin confirms | No ticket and no boarding pass before confirm; boarding-pass route 404 until `CONFIRMED` | none (check `customer-booking` separately) | n | gap-proposed |
| OPS-063 | admin | Reject on confirmation | Reject availability | Booking leaves the gate; refund path starts; seats released | none | n | gap-proposed |
| OPS-064 | admin | Reschedule queue | `/admin/reschedules` approve and reject a request | Approved: leg changes, fare difference per season rules. Rejected: reason sent | none (customer side may be in `reschedule-season.spec.ts`, not read) | n | gap-proposed |
| OPS-065 | admin | Webhook log | `/admin/webhooks`, search, status filter, "rejected" tab | Events listed; unauthenticated rejects only on their tab; filters combine | `admin-webhooks.spec.ts` › "the webhook log lists events, filters them and retries a failed one" | n | covered-by-existing |
| OPS-066 | admin | Webhook retry | Retry a failed event; check events with no handler | Only an event with a handler shows Retry; retry processes it, attempts increase | `admin-webhooks.spec.ts` › "the webhook log lists events, filters them and retries a failed one" | n | covered-by-existing |
| OPS-067 | admin | Customer sees payment arrived | Open the booking page after a payment | Customer told payment arrived | `admin-webhooks.spec.ts` › "a paid booking tells the customer that payment arrived" | n | covered-by-existing |
| OPS-068 | admin | E-ticket delivery, unmatched mail | `/admin/eticket-delivery`; forward an email whose code matched nothing | Admin forwards it; sent once | `eticket-operator-email.spec.ts` › "an email without a code that matches nothing waits for the admin, who forwards it" | y for a real inbox check; the spec uses a stub | covered-by-existing |
| OPS-069 | admin | E-ticket delivery, no-mailbox button | "Check mailbox now" with no mailbox | Reports instead of failing | `eticket-operator-email.spec.ts` › "the "Check mailbox now" button reports instead of failing when no mailbox is configured" | n | covered-by-existing |
| OPS-070 | admin | Diagnostics | `/admin/diagnostics` as super admin | Shows the running version | `admin-diagnostics.spec.ts` › "super admin sees the running version on diagnostics" | n | covered-by-existing |
| OPS-071 | super-admin | Seasons add, reject, delete | `/admin/console/seasons` add a range, a bad range, delete | Saved; bad range refused; deleted | `admin-seasons.spec.ts` › "super admin can add, reject a bad range, and delete a season" | n | covered-by-existing |
| OPS-072 | super-admin | Manual price override | `/admin/operations/departures/<legId>` adjust the price | Departure leaves its season and keeps the manual price | `admin-seasons.spec.ts` › "a manual price override opts the departure out of its season" | n | covered-by-existing |
| OPS-073 | super-admin | Coupons | `/admin/console/coupons`: create, edit, toggle, archive, bulk codes; apply at booking | Codes work on seat fares, quota is the cap, first booking by email or phone | none | n | gap-proposed |
| OPS-074 | super-admin | Platform config and commission | `/admin/console/pricing`, `savePlatformConfig`, `setOperatorCommission` | Saved; new bookings use the new values; old bookings unchanged | none | n | gap-proposed |
| OPS-075 | super-admin | Payment modes | `/admin/console/payments`, `savePaymentModes` | Customer checkout reflects the enabled modes | none | n | gap-proposed |
| OPS-076 | super-admin | Alert config | `/admin/console/alerts`, `saveAlertConfig` | Saved; template takes nine positional variables | none | y (a real WhatsApp alert) | gap-needs-human |
| OPS-077 | super-admin | Boats and schedules (admin) | `/admin/operations/boats`, `schedules`: create, edit, status, regenerate departures, delete | Soft delete (`deletedAt`); lists hide deleted rows; departures regenerate | none | n | gap-proposed |
| OPS-078 | super-admin | Cancel a departure | `cancelDeparture` on a leg with bookings | Leg cancelled; affected bookings flagged; customers notified; refunds follow policy | none | y for the delivery of notifications | gap-proposed |
| OPS-079 | admin | Operators list, create, detail | `/admin/operators`, `/new`, `/[id]` | Operator created; detail shows its own data only | none | n | gap-proposed |
| OPS-080 | admin | Dashboard and promo redirects | `/admin`, `/admin/promos`, `/admin/promos/new` | Dashboard renders; promo pages redirect to `/admin/console/coupons` | none | n | gap-proposed |

#### D. API, cron and webhooks (system)

| ID | Persona | Page/flow | Steps | Expected result | Spec file + test title | Needs human | Coverage |
|---|---|---|---|---|---|---|---|
| OPS-090 | system | Operator mailbox poll, no mailbox | Call `/api/cron/poll-operator-inbox` with the secret and no mailbox | Harmless no-op | `eticket-operator-email.spec.ts` › "with no mailbox configured the poll route is a harmless no-op" | n | covered-by-existing |
| OPS-091 | system | Mailbox poll, forward once | Email with our booking code | Forwarded to the buyer, once | `eticket-operator-email.spec.ts` › "an email with our booking code is forwarded to the buyer, once" | n | covered-by-existing |
| OPS-092 | system | Mailbox poll, stranger | Email from a sender that is not a PIC trigger | Skipped, nothing forwarded | `eticket-operator-email.spec.ts` › "mail from a stranger is skipped and nothing is forwarded" | n | covered-by-existing |
| OPS-093 | system | Mailbox poll, no PDF | Email without an attachment | Waits for the admin | `eticket-operator-email.spec.ts` › "an email without a PDF waits for the admin and nothing is forwarded" | n | covered-by-existing |
| OPS-094 | system | PIC WhatsApp on payment | Pay a booking | Operator PICs get the template call | `eticket-pic.spec.ts` › "paying a booking notifies the operator PICs" (skips without `WHATSAPP_TEMPLATE_ORDER_NOTIF`) | y (the message actually arriving on a phone) | covered-by-existing (call only) |
| OPS-095 | system | WhatsApp delivery status | Signed delivery POST | Acknowledged and logged once | `whatsapp-webhook.spec.ts` › "a signed delivery status is acknowledged and logged once" | n | covered-by-existing |
| OPS-096 | system | DOKU payment success | Signed success notification | Booking moves to `AWAITING_CONFIRMATION` once; a duplicate does nothing; non-IDR refused; payment on an expired booking logged as unmatched | none in e2e (the spec notes the endpoint fails closed without keys); unit: `tests/unit/features/payments/doku-signature.test.ts` | n | gap-proposed |
| OPS-097 | system | Real DOKU payment | Pay Rp 1 on the deployed staging site | Gateway hand-off works; notification arrives; status updates | `doku-one-rupiah.spec.ts` (opt-in, hand-off only, never pays; not read for this map) | y (completing a real payment) | gap-needs-human |
| OPS-098 | system | PayPal event | Signed capture event | Payment recorded once | none; unit: `tests/unit/features/payments/paypal.test.ts` | y for a real PayPal approval | gap-proposed |
| OPS-099 | system | `retry-webhooks` cron | Failed event exists; call with the secret | Event reprocessed; payment recorded; attempts bumped | none; unit: `tests/unit/app/api/cron/retry-webhooks.test.ts` | n | gap-proposed |
| OPS-100 | system | `send-reminders` cron | Booking departing soon; call with the secret | One reminder per booking; none sent twice | none | y (delivery by email or WhatsApp) | gap-needs-human |
| OPS-101 | system | `topup-legs` cron | Schedule with legs about to run out; call with the secret | New legs generated; none duplicated | none | n | gap-proposed |
| OPS-102 | system | `refresh-fx` and `poll-bmkg` crons | Call with the secret | FX rates and sea condition updated; failures of the external API do not break the site | none | y (external APIs; needs network and real data) | gap-needs-human |
| OPS-103 | system | `marketing-deliver` cron | Events in the outbox; flags on or off | Off: nothing sent. On: each send gated on consent and match data, retried with backoff | none | y (GA4, Meta and Google Ads accept the event) | gap-needs-human |
| OPS-104 | system | `ads-sync` cron | Call with the secret | Whole account-days replaced; a failed or empty sync never erases spend | none; unit: `tests/unit/features/marketing/ads/ads-sync.test.ts` | y (live ad accounts) | gap-needs-human |
| OPS-105 | admin | Spend import and template | `/api/admin/marketing/spend-template`, `spend-import` with a valid, invalid and repeated CSV | Valid imported; invalid refused with a report; re-import adds nothing | none | n | gap-proposed |
| OPS-106 | admin | Consent withdrawal and reconciliation | `/api/admin/marketing/consent-withdrawal`, `reconciliation`, `sync` | Withdrawal stops pending sends; reconciliation is read-only; repair only records missing events | none | n | gap-proposed |
| OPS-107 | system | Marketing collect endpoint | POST `/api/marketing/collect` with allowed fields, extra fields, PII | Only funnel counts stored; PII refused; works without consent only for counts | none (`marketing-consent.spec.ts` covers the browser `dataLayer`, not this endpoint) | n | gap-proposed |
| OPS-108 | system | Marketing consent endpoint | `/api/marketing/consent` set and withdraw | Cookie and record follow the choice | `marketing-consent.spec.ts` › "accepting keeps the landing that arrived before the choice and updates consent" and › "rejecting stores only the choice and drops click ids; the footer link reopens the banner" (browser side; whether these requests reach the endpoint was not checked) | n | covered-by-existing (browser side) |
| OPS-109 | system | Banner and `dataLayer` hygiene | Fresh visit; accept; navigate; reject | Defaults to denied, no PII, booking refs masked, one `page_view` per navigation; admin pages never load the container | `marketing-consent.spec.ts` › all 5 tests under "marketing consent and dataLayer" | n | covered-by-existing |
| OPS-110 | system | Public booking artefacts | GET `/api/bookings/<ref>/boarding-pass` and `/ics` for a confirmed, a pending and an unknown reference | Confirmed returns the PDF or calendar file; pending and unknown return 404 | none | n | gap-proposed |
| OPS-111 | system | Promo validation | POST `/api/promos/validate` valid, expired, over quota | Correct answer; nothing mutated | none | n | gap-proposed |
| OPS-112 | system | Google sign-in | `/api/auth/google/start` and `/callback` with a bad `state` | Refused; no session | none | y (real Google consent screen) | gap-needs-human |

#### Counts

| Coverage | Cases |
|---|---|
| covered-by-existing | 26 |
| gap-proposed | 55 |
| gap-needs-human | 11 |
| **Total** | **92** |

(`covered-by-existing` includes 3 marked weak or partial: OPS-022, OPS-094 and OPS-108. OPS-025, 060 and 061 are labelled gap-needs-human but have an automatable part, noted in their row.)

#### Gap risk ranking

**High**
- OPS-001, 002, 003, 004, 005: operator access control and tenant scoping have **no e2e check**. The operator layout renders without a session, so protection depends on every page. This is the biggest risk for the redesign too.
- OPS-006, 007, 008, 009: admin access control covers 2 pages of about 30; plain-admin versus super-admin is untested; the operator hard-delete guard (Payment, Refund, Ticket) is untested.
- OPS-010: 7 of 8 cron routes untested for the secret check.
- OPS-011, 012, 014, 015: webhook signature rejection for DOKU and PayPal, marketing API role checks and the MCP token have no e2e (unit exists for DOKU and PayPal).
- OPS-024, 026: check-in and POS sale (boarding and money).
- OPS-058, 061, 062: refund approval, confirmation, and the payment-to-ticket gate.
- OPS-096, 099: DOKU success processing and the retry cron.
- OPS-028, 078: schedule creation (legs) and cancelling a departure with bookings.

**Medium**
- OPS-021, 051 (failed logins), 023, 029, 030, 032, 039, 059, 063, 064, 073, 074, 075, 077, 079, 098, 101, 105, 106, 107, 110.

**Low**
- OPS-027, 031, 033, 035, 036, 037, 040, 041, 080, 111, and the read-only report pages.

**Weakness in existing coverage**
- OPS-022: the manifest check silently passes when no leg link is visible.
- OPS-094, 090–093, 095: these skip when their env variables are missing, so a CI without them runs none.
