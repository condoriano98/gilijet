# Bug List: Round Trip (QC GIL-28)

**Created:** 2026-10-09
**Source:** QC GIL-28 (2026-10-08, code review) + findings during investigation
**Scope:** Return / Round Trip feature bugs on staging. One place for all bug tickets + follow-ups.

**Status as of 2026-10-14:** all five bugs are fixed, committed, and on `origin/staging` (release **v1.1.0** in `CHANGELOG.md`; Vercel staging `gilijet.vercel.app`). Not yet in production: `main` has not received a merge from `staging`. The `lib/…`, `app/…`, `components/…` paths in this document are the old structure; they are now `src/features/…`, `src/app/…`, `src/shared/…` (see `STRUCTURE.md`).

Status: ✅ Fixed, on staging · 🔴 Open · ⚠️ Follow-up (not yet a ticket)

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Return search errors, Outbound/Return list does not show | Blocker | ✅ Fixed (`e0bdf98`), verified live locally and on Vercel staging |
| 2 | Return leg check-in rejected with "Already checked in" | Blocker | ✅ Fixed (`be2abc0`), verified live locally and on Vercel staging |
| 3 | Return passengers do not appear in the operator manifest & admin departure | Blocker | ✅ Fixed (`fece18d`), verified live locally and on Vercel staging |
| 4 | Cancelling a departure does not cancel, refund, or notify Return bookings | Blocker | ✅ Fixed (`fece18d` + `28dbe1d`), verified live locally and on Vercel staging |
| 5 | Round-trip WhatsApp sends only 1 boarding pass (outbound) and the cancellation does not mention both legs | Critical | ✅ Fixed (`1d16552`), verified live on gilijet.vercel.app |

---

## 1. Return search error (serializer)

**Symptom:** `/search?...&returnDate=...` shows "Something went wrong". Vercel runtime log: `Functions cannot be passed directly to Client Components ... {constructor: function i, s: 1, e: 5, d: ...}`.

**Root cause:** `lib/serialize-decimals.ts` detects Decimal via `obj.constructor.name === 'Decimal'`. In the Prisma build the class name is minified to `i`, so the Decimal was copied as a plain object together with its `constructor` property (a function). `Date` also became `{}` (it has no enumerable properties). The unit test used a fake Decimal named `'Decimal'` and even locked in the `Date → {}` behaviour, so the test stayed green.

**Fix (`e0bdf98`, staging, deployment READY):**
- `serializeDecimals` uses `Prisma.Decimal.isDecimal()`; `Date` is passed through as is.
- Tests use a real `new Prisma.Decimal(...)`; the Date test now asserts that a Date stays a `Date`.
- `search/page.tsx`: the rating lookup also covers schedules from return legs; `ratingsByScheduleId` is passed as a plain object.

**Acceptance Criteria:**
- [x] Return search on staging shows Outbound and Return with correct times & prices — _verified live 2026-10-09, round 2_
- [x] No new errors in the Vercel runtime log — _runtime log of the verified deployment clean, rounds 2 and 3_
- [x] Serializer unit test covers Date + Decimal

**Remaining:** `type LegForClient = any` in `components/customer/round-trip-leg-selector.tsx` has not yet been replaced with the correct type.

---

## 2. Return leg check-in rejected with ALREADY_CHECKED_IN

**Symptom:** A round-trip passenger checks in successfully on the outbound leg, but the scan on the return leg is rejected with `ALREADY_CHECKED_IN`.

**Verified in code:**
- `lib/ticket-issuer.ts`: 1 ticket per passenger per booking, with a single status/`checkedInAt`.
- `app/api/operator/checkin/route.ts`: rejects if `ticket.status === 'CHECKED_IN'` at the ticket level.
- The QR is already per-leg via the date (HMAC of `ticketCode + date`; the return PDF uses the return leg's date). So the outbound QR cannot be used on the return leg and vice versa; only the check-in status is broken.

**Fix (`be2abc0`):** `TicketCheckin(ticketId, legId, checkedInAt, checkedInBy)` table with a unique `(ticketId, legId)`.
- `lib/leg-checkin.ts`: `boardedLegIds`, `ticketStatusOnLeg`, `checkedInAtOnLeg`, `recordLegCheckin`. The gate is `createMany(skipDuplicates)` on the unique row (safe against races between scanners, does not abort the Postgres transaction).
- `checkin/route.ts`: "already checked in" is checked per leg. `Ticket.status` becomes `CHECKED_IN` only after all legs are boarded (1 for one-way, 2 for round-trip), so refunds (which target `ISSUED`) stay correct for a half-used ticket.
- Manifest JSON/CSV/print and the operator leg page read the per-leg status. Manual check-in is enabled again for round-trip (using the same helper).
- Old tickets that are already `CHECKED_IN` without a row are treated as having boarded the first leg (outbound); no backfill needed.
- `ticketCode`, QR, and PDF are unchanged. The QR is already per-leg via the date.
- Tests: helper, two-leg route flow (in-memory), per-leg manifest. 831 unit tests pass in total.

**Deploy (status at the time; since 2026-10-14 the schema is Prisma migrations and the build runs `prisma migrate deploy`, see `VERSIONING.md`):** this repo has no migration files; every Vercel build runs `prisma db push` (without `--accept-data-loss`) against the configured Supabase. The new table is additive, so it is applied automatically when the branch is pushed. The local `.env` points to the remote Supabase, so `db push` is not run from local.

**Acceptance Criteria:**
- [x] Outbound then return check-in succeeds (route unit test)
- [x] Scanning twice on the same leg is still rejected
- [x] The outbound QR cannot board the return leg, and vice versa
- [x] Two-leg check-in unit test
- [x] One-way is unaffected (one-way test)
- [x] Real test on staging — _round 2 (2026-10-09): staging `QR_HMAC_SECRET` created, new tickets issued via the admin UI, outbound then return check-in, re-scan and cross QR rejected_

**Note:** `QR_HMAC_SECRET` exists only in the `production` target on Vercel (checked 2026-10-09: no entry for the custom environment "staging"). It must be added for the staging environment before testing QR check-in.

---

## 3. Return passengers do not appear in the manifest / admin departure

**Symptom:** A round-trip booking stores `legId = null`; all per-leg queries use `leg.bookings` (the one-way relation), so round-trip passengers do not appear. The `outboundBookings` / `returnBookings` relations are not used anywhere.

**Fix (`fece18d`):**
- `bookingsOnLegWhere(legId)` helper + `legRoleForBooking` in `lib/booking-helpers.ts`.
- Used in: manifest JSON, CSV ("Trip" column), print manifest, `getOperatorLeg` (operator leg page), Admin Departure detail, departure list counts (`/admin/operations`), schedule delete guard.
- "Round trip · outbound/return" badge on the operator and admin pages.
- Tests: helper, `getOperatorLeg`, `cancelLeg`, manifest JSON/CSV routes (one-way + round-trip). Total unit tests 810/810.

**Acceptance Criteria:**
- [x] Operator manifest (page + CSV) of the outbound leg shows round-trip passengers
- [x] Return leg manifest shows the same passengers
- [x] Admin departure detail shows round-trip bookings on both legs
- [x] Per-leg counts include round-trip bookings (no seat accounting; `booking-engine` has no capacity check)
- [x] Manifest unit test one-way + round-trip
- [x] Manual verification on staging — _round 2; what was checked was text/DOM, not visual appearance_

---

## 4. Departure cancellation does not cancel / refund / notify Return bookings

**Symptom:** When an operator/admin cancels leg A or B, the Return booking stays `CONFIRMED`: not cancelled, no Refund, tickets not voided, customer not notified. `cancelLeg` (`lib/legs.ts`) looks up `where: { legId, status: 'CONFIRMED' }`, while round-trip stores `legId = null`.

**Done:**
- (`fece18d`) `cancelLeg` uses `bookingsOnLegWhere`: whichever leg is cancelled, the round-trip booking becomes `CANCELLED_BY_OPERATOR`, tickets `REFUNDED`, 1 Refund of 100% of `totalAmount`, all in one `$transaction`. The schedule delete/deactivate guard also counts round-trip bookings.
- (`28dbe1d`) **Notification:** `cancelLeg` returns `cancelled: [{bookingId, refundAmount}]`; admin `cancelDeparture` and the operator cancel action call `notifyLegCancelled` (email + WhatsApp via `notifyOperatorUnavailable`, round-trip mentions both legs) after the transaction commits. Send failures are swallowed per booking.
- (`28dbe1d`) **Other leg already past:** a round-trip booking whose other leg is `SAILED` or already past its date is not cancelled; it is returned in `skipped` and shown as a warning on the admin and operator pages to be handled manually. (This rule is a proposal, not yet confirmed by the business.)
- (`28dbe1d`) Unit tests: cancel via the outbound leg and via the return leg with one-way + round-trip together (booking status, tickets, number of Refunds), skip past leg, existing refund, and `notifyLegCancelled`. 839 unit tests pass in total.

**Acceptance Criteria:**
- [x] Cancel outbound / return leg → Return booking fully cancelled, 100% refund (in code; not yet tested against a real DB)
- [x] Email + WhatsApp notification mentions both legs (unit test; real sending not yet tested)
- [x] A Return booking whose other leg is already past is not wrongly affected
- [x] Schedule deactivation guard blocks if there are active round-trip bookings
- [x] Cancel leg unit test one-way + round-trip
- [x] One-way flow unchanged

**Pending decision (business):** the rule "other leg already past → hand over to admin" has not been confirmed.

**Cancellation reason (done in v1.1.1, 2026-10-14):** the reason the admin fills in on the departure cancellation form now goes into the email ("Reason: …", escaped) and WhatsApp ("Alasan: …", max. 200 characters). `notifyLegCancelled` and `notifyOperatorUnavailable` accept an optional `reason`; admin `cancelDeparture` passes it. **Deferred:** the cancel action on the operator page does not yet pass the reason along (operator deferred for now), and the unavailability confirmation (`/admin/confirmations`) is intentionally without a reason.

---

## 5. Round-trip WhatsApp: only 1 boarding pass, cancellation does not mention both legs

**Found:** 2026-10-09, from the Vercel runtime log during live verification (not from a QC ticket).

**Symptom:**
- A round-trip booking produces 2 boarding pass PDFs (outbound and return, each with its own QR). The email attaches both, but WhatsApp sends only `attachments[0]` (outbound) with route/date text for the outbound leg only. A customer who relies on WhatsApp does not receive the return pass and does not know they bought 2 tickets.
- The cancellation WhatsApp (`sendOperatorUnavailableWhatsapp`) is generic and does not mention both legs, even though acceptance criterion #4 asks for email + WhatsApp to mention both legs.

**Expected (user confirmation):** WhatsApp and email both convey 2 tickets for a round-trip.

**Fix (`1d16552`):**
- `notifyBoardingPassIssued`: one WhatsApp document per PDF, in order (outbound first), each caption saying "boarding pass berangkat/pulang Anda terlampir (1 dari 2)" along with that leg's route and time and that this booking is 2 boarding passes. A send failure for one pass does not stop the other. The email remains 1 email with 2 PDFs.
- The text fallback (PDF generation failed) now writes out both legs and mentions 2 boarding passes.
- Cancellation WhatsApp: for round-trip it says "dibatalkan seluruhnya (kedua perjalanan)" along with the outbound and return legs.
- One-way is unchanged (identical caption and text, one document). Both messages are ordinary session messages (not WATI templates), so no template approval is needed.
- Tests: 12 new unit tests (order and content of the two documents, partial failure, one-way unchanged, text fallback, cancellation text). 851 unit tests pass in total.

**Acceptance Criteria:**
- [x] Round-trip: WhatsApp sends 2 boarding passes (outbound and return), each pass mentioning its leg
- [x] Round-trip: email remains 1 email with 2 PDFs and the details of both legs
- [x] Cancellation WhatsApp mentions both legs
- [x] One-way unchanged
- [x] Unit tests
- [x] Live verification on staging (mock mode: text checked in the Vercel runtime log, 2026-10-09)

**Note:** WhatsApp session messages are only delivered if the customer contacted the business within the last 24 hours (an existing WATI limitation, not changed here); real sending has not been tested because staging has no WATI keys.

---

## Live verification (2026-10-09)

### Round 1: local against the staging DB
`next dev` (port 3100) against the Supabase staging DB (project `asymnwikxyhipoezoggp`, used by `.env.staging`; production uses `viluiajknccclsogyogv`), existing QA accounts, mock email/WhatsApp/payment. The `TicketCheckin` table was applied to the staging DB via `prisma db push` (additive, without `--accept-data-loss`). **38/38 checks passed.**

### Round 2: gilijet.vercel.app (Vercel staging, commit `3d2fcac`, redeployed after the staging `QR_HMAC_SECRET` was created)
Access via a temporary Vercel share link (the site is behind Deployment Protection). Bookings were created through the app path in the staging DB; **tickets were issued via the admin UI on gilijet**, QRs taken from the operator manifest endpoint on gilijet (signed with the staging secret). **39/39 checks passed**, Vercel runtime log for that deployment: zero errors/fatals.
- **#1** The repro URL from the ticket no longer errors; the QA route shows Outbound + Return with times and prices.
- **Staging `QR_HMAC_SECRET`** works: admin confirmation issues tickets and sends the boarding pass (mock email attaches the outbound + return PDFs for round-trip).
- **#3** Manifest JSON/CSV/print, operator leg page, Admin Departure detail on both legs include the round-trip passengers with the badge.
- **#2** Outbound then return check-in for the same passenger; re-scan rejected per leg; cross QR rejected (`INVALID_QR`); per-leg status in the manifest correct; one-way unchanged.
- **#4** Cancel via the return leg and via the outbound leg from the admin UI: booking cancelled, tickets `REFUNDED`, 1 refund of 100%; a round-trip with the other leg `SAILED` was not cancelled and raised a warning. Runtime log: cancellation email + WhatsApp (mock) recorded for the cancelled bookings and not for the skipped one.

### Findings from the round 2 log
Round-trip WhatsApp sends only 1 boarding pass and the cancellation WhatsApp does not mention both legs: recorded and fixed as bug #5.

### Round 3: bug #5 verification on gilijet.vercel.app (commit `c2b5005`, deployment `dpl_9iEC…`)
Booking `VERIFY3` was confirmed via the gilijet admin UI, one round-trip was cancelled via the return leg; message content was read from the Vercel runtime log (mock mode), zero errors/fatals.
- **Round-trip, 2 passengers (P-RT):** WhatsApp sent 2 documents in order: "boarding pass berangkat Anda terlampir (1 dari 2)" (Sanur → Nusa Penida, 15 Nov 08:00) then "boarding pass pulang Anda terlampir (2 dari 2)" (Nusa Penida → Sanur, 17 Nov 16:00), both mentioning "Pemesanan pulang-pergi: 2 boarding pass (berangkat dan pulang), masing-masing dengan QR code sendiri". Email: 1 email, 2 tickets, 2 PDFs (outbound + return).
- **One-way (P-OW):** 1 WhatsApp and 1 PDF, old caption without leg markers (unchanged).
- **Round-trip cancellation (P-CX):** WhatsApp contains "Pemesanan pulang-pergi dibatalkan seluruhnya (kedua perjalanan)" along with the outbound and return legs, plus the cancellation email; booking `CANCELLED_BY_OPERATOR`, 1 refund 500000/500000.

### Round 4: follow-up fixes, v1.1.1 (2026-10-14, local against the staging DB)

Local dev server, staging DB; WATI, Resend, DOKU and PayPal keys blanked in the process (the local env contains production keys), no real payments or messages. What was done: cancellation reason in email/WhatsApp, server-side rejection of rescheduling to an OFF day, and one bug found while writing its E2E. The operator and boat-delete parts were deferred.

| Check | Result |
|---|---|
| `pnpm typecheck` (app + e2e), `pnpm lint` | Clean, 0 errors (1 old warning in `postcss.config.mjs`) |
| `pnpm vitest run`, clean shell | 881/881, 52 files |
| New units: `messaging/email.test.ts` (reason shown, not shown without a reason, HTML escaped and truncated to 200 characters), `whatsapp.test.ts` (3 reason cases), `booking/notifications.test.ts` (reason passed to email and WhatsApp) | Pass |
| New E2E `reschedule-season.spec.ts` (3): date picker shows open days and hides OFF days; a request to an OFF leg forced through a modified form is rejected by the server ("Selected departure is unavailable", 0 `RescheduleRequest`); a request to an open leg still succeeds | 3/3 |
| Full E2E suite, 2 workers | 21 passed, 4 long-skipped, 0 failed |
| Full E2E suite, 5 workers | 1 failed: `admin-seasons` 60 s timeout waiting for the email field on `/admin/login`. Passes when the spec is run alone and in the 2-worker run. Suspected dev server load with many workers; exact cause not proven |
| E2E fixtures on staging after the run | 0 left; the real season is still 8 rows |

**New bug found: customer reschedule requests always fail.** The form has no `customerNote` field, so `formData.get('customerNote')` is `null`, and the Zod schema rejects `null` ("Invalid input"). Applied before this change; fixed with `?? undefined`. The 3rd test above proves a valid request is now saved (`PENDING`).

Not tested: real email/WhatsApp sending (only message content generation via unit tests), payments, and visual appearance.

### Not covered
- Notifications were tested in mock mode (staging has no Resend/WATI keys): no real messages were sent.
- The cancel action on the operator page was not exercised (only cancel via admin); see follow-up 7.
- Visual appearance was not checked manually (only text/DOM).

### Test data left in the staging DB
- Round 1: 5 `VERIFY` bookings (BK-2026-10-AJBU5Q, -VRJ9E9, -BZK3AJ, -PT4Z6H, -RCZMDP); QA Boats test legs 14-16, 20-22, 26-28 Oct (3 cancelled, 1 `SAILED`).
- Round 3: 3 `VERIFY3` bookings (BK-2026-10-J5CZLJ, -PPEBUU, -6BF99S); QA Boats test legs 15-17 and 21-23 Nov (2 legs cancelled); 1 `PENDING` Refund; QA Boats legs extended to +75 days.
- Round 2: 5 `VERIFY2` bookings (BK-2026-10-GLTZYP, -GJ5WC4, -3LKCU7, -RHCG2E, -FQRW3V); QA Boats test legs 4-6, 10-12, 16-18 Nov (3 cancelled, 1 `SAILED`).
- Total 4 `PENDING` Refunds, and 132 new QA Boats legs (10 Oct to 22 Nov) from `generateLegsForSchedule`.

---

## Follow-up (not yet tickets)

1. ⏸ **`collectBoatSubtree` in `src/features/operators/purge.ts`** finds bookings only via `legId`, so it is blind to round-trip bookings. **Deferred.** Re-checked 2026-10-14: this function is not called anywhere (the one in use is `collectOperatorSubtree`, which is safe) and all `Booking` → `Leg` FKs are `onDelete: Restrict`, so the database rejects deletions that are still linked. No impact now; fix it (also match `outboundLegId`/`returnLegId`) before this function is used.
2. ✅ **Manual check-in** in `app/operator/legs/[id]/page.tsx`: enabled again for round-trip via the same per-leg helper as bug #2.
3. ⏸ **Weather path** on the operator leg page: the dedicated `WEATHER` block looks for `CONFIRMED` bookings after `cancelLeg` has already cancelled all of them, so it finds nothing. **Deferred (operator).** Money is not affected (the refund is created by `cancelLeg`); what may be missing is only the recording of the weather reason on the refund and in the audit log.
4. ✅ **Round-trip E2E** (`round-trip-booking.spec.ts`) active again (2026-10-14). Cause of the skip: `seed:qa` only creates legs in the July–August demo window, so the "next 7 days" search found nothing. The spec now creates its own fixture (year 2093), pays via mock mode (guarded: skips if live payment keys exist), and checks the Outbound/Return breakdown.
5. ⚠️ **`QR_HMAC_SECRET`:** created in Vercel staging (used in the round 2 verification). In the local env (`.env`/`.env.local`/`.env.staging`) its value is shorter than 32 characters, so `/b/<reference>` for a ticketed booking errors during development (found 2026-10-14 during versioning QC). Tests still mock `qr`.
6. ✅/⚠️ **`CRON_SECRET`:** found 2026-10-14 to be missing entirely from the Vercel project `gilifast`, so the `/api/cron/*` routes (since 2026-05-20) always returned 401 and `topup-legs`, `refresh-fx`, `retry-webhooks` never ran. **Added 2026-10-14** for production and for the custom `staging` environment (two different random values, type `sensitive`; the values are not written in the docs). A new variable is only read after the next deploy, so production cron only starts running with the next production release (see `docs/RELEASING.md`). Vercel Cron only runs on Production deployments; on staging this key is only for manual invocation. **Still open:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `WATI_*` are also not visible in that project (needs confirmation whether production notifications use mock), and the README mentions a `gilifast-staging` project while staging appears to be the custom `staging` environment in the `gilifast` project (domain `gilijet.vercel.app`, branch `staging`).
7. ⏸ **The cancel action in `src/app/operator/legs/[id]/page.tsx`** calls `redirect()` inside a `try` whose `catch` also catches `NEXT_REDIRECT`, so a successful cancel redirects to `?error=NEXT_REDIRECT` (confirmed from the code 2026-10-14; not yet tried at runtime). **Deferred (operator).** Conflicts with the `CLAUDE.md` convention (re-throw `NEXT_REDIRECT`).
