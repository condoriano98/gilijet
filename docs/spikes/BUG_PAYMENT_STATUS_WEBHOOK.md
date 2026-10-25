# Bug: booking status is not updated after a successful payment

**Status (2026-10-16):** done and on `staging` as commit `7eb88f6`, tag `v1.3.0`. Not yet on `main`/production. The `WebhookEvent` index/unique migration was not taken (no user decision yet, rule 4). Follow-up for the customer badge: `BUG_DOKU_PAYMENT_CONFIRMATION.md` (v1.3.1).
**Created:** 2026-10-16
**Target version:** 1.3.0 (MINOR: new webhook log page + fixes)
**Ticket:** "[Bug] Booking status is not updated after a successful payment at the payment gateway". Example case `BK-2026-09-P6EXQV` (reported from gilibali.com, i.e. production; we do not touch it, `CLAUDE.md` rule 1).

## Report

After a payment is confirmed by DOKU/PayPal, the booking status in admin Bookings is not updated automatically and stays "Waiting Confirmation".

**Steps to reproduce**

1. Open gilibali.com, book through to completed payment.
2. Make sure the payment is recorded as successful on the payment gateway side.
3. Log in as admin → Bookings.
4. Check the status of the newly paid booking.

**Expected:** status automatically becomes Paid/Confirmed after a successful payment.
**Actual:** stays "Waiting Confirmation" even though the gateway succeeded.
**Reporter's suspicion:** the webhook/callback is not triggered, or the callback endpoint fails to update the DB.

**Acceptance criteria (from the ticket)**

- AC1: booking status is updated automatically to Paid/Confirmed after the gateway sends a successful callback.
- AC2: no manual refresh needed by the admin.
- AC3: a webhook log is available for monitoring when a callback fails.

### Mapping ACs to the plan

| AC | Met by | Notes |
|----|--------|-------|
| AC1 | Successful webhook → `AWAITING_CONFIRMATION`, shown as "Paid · awaiting confirmation" (plan 5). Failed callbacks are recovered by the fixed retry cron (plan 1–2). | "Confirmed" still waits for an admin at `/admin/confirmations` (Decision). Needs to be communicated to the reporter: "Paid" is automatic, "Confirmed" is not. |
| AC2 | The Bookings page is dynamic per request, plus `auto-refresh.tsx` (`router.refresh()` every 30 seconds, skipped while the tab is hidden). | Implemented 2026-10-16 with the interpretation "without reload"; the user has not confirmed this interpretation. |
| AC3 | Rejected callbacks are recorded (plan 3) + `/admin/webhooks` page with Retry (plan 4) + 24-hour `FAILED` count in diagnostics. | |

## Findings

1. **"Waiting Confirmation" is intentional behaviour.** `recordPaymentAwaitingConfirmation` (`src/features/tickets/ticket-issuer.ts`) moves the booking `PENDING_PAYMENT` → `AWAITING_CONFIRMATION` when the money arrives. `CONFIRMED` and the tickets are only issued after an admin phones the operator at `/admin/confirmations` (the "Payment → ticket gate" rule in `CLAUDE.md`). Admin shows `status.replace(/_/g, ' ')` (`src/app/admin/(authed)/bookings/booking-row.tsx`), so "already paid" is not distinguished from "no news yet". A booking whose webhook truly failed stays `PENDING_PAYMENT`.
2. **The retry cron does not recover DOKU payments.** `src/app/api/cron/retry-webhooks/route.ts` calls `dispatchWebhookPayload`, which only recognises the Xendit shape (`status=PAID`, `external_id`). DOKU payloads (`order.invoice_number`, `transaction.status`) fall through to `ignored`, and the event is then marked `PROCESSED` without processing anything. The cron only selects `provider: 'doku'`, so PayPal events are never retried. The cron has only been able to run since `CRON_SECRET` was set (2026-10-14).
3. **Rejected callbacks are not recorded.** Wrong signature (401), invalid JSON (400), booking not found (200 "ignored") and amount mismatch (409) only write a `console.error` or nothing at all.
4. **There is no UI for `WebhookEvent`.** Only the routes and the cron touch its table, so the acceptance criterion "webhook log available" is not met.

## Decision

- The operator confirmation gate is **kept** (decided by the user 2026-10-16). No auto-confirm.
- No schema change: `WebhookEventStatus` already has `SKIPPED`, `errorMessage` and `attempts`.

## Plan

1. `src/features/payments/webhook-processor.ts`: extract `processDokuPaymentSuccess` (from the DOKU route) and `processPaypalEvent` (from `handleEvent` in the PayPal route). Replace `dispatchWebhookPayload` with `dispatchWebhookEvent(event)`, which chooses by `provider` + `eventType`. Reuses `recordPaymentAwaitingConfirmation`, `notifyPaymentReceived`, `normalizePaymentMethod`.
2. `retry-webhooks`: pick up the `doku` and `paypal` providers; an unrecognised payload becomes `FAILED` with a clear message, not `PROCESSED`.
3. The DOKU and PayPal routes record rejected callbacks to `WebhookEvent` (signature, JSON, booking not found = `SKIPPED`, amount mismatch). The payload is truncated to ±4 KB because the endpoint is public; recording is in a try/catch so the response to the gateway does not change.
4. `/admin/webhooks` page (`requireAdmin()`): event list, provider/status/booking reference filters, WITA time, a Retry button for `FAILED` (writes `AuditLog`). Link in the admin nav, 24-hour `FAILED` count at `/admin/diagnostics`, entry in `feature-catalog.ts`.
5. Status label in admin Bookings through a single helper: `AWAITING_CONFIRMATION` = "Paid · awaiting confirmation", `PENDING_PAYMENT` = "Unpaid". The page is not cached (already dynamic because of `searchParams`; no `force-dynamic` needed).
6. Release: bump `package.json` to 1.3.0, dated section + compare links in `CHANGELOG.md`; update `STRUCTURE.md`, README and other docs that `git grep` finds.

## Checklist

- [x] 1 processor + dispatcher (`webhook-processor.ts`, `webhook-events.ts`)
- [x] 2 retry cron
- [x] 3 rejected-callback recording (rate limit 50 per 10 minutes per provider, body truncated to 4 KB)
- [x] 4 `/admin/webhooks` page + diagnostics + feature catalog
- [x] 5 status label (`src/features/booking/status-label.ts`)
- [x] 5b Bookings auto-refresh (AC2), `bookings-auto-refresh.test.ts`
- [x] Unit tests: `webhook-processor`, `webhook-events`, `status-label`, `retry-webhooks`, `webhooks-guard`
- [x] E2E written: `tests/e2e/admin-webhooks.spec.ts` (not yet run)
- [x] `pnpm lint` (0 errors, 1 existing warning in `postcss.config.mjs`), `pnpm typecheck`, `pnpm test:unit`
- [x] `pnpm test:e2e` against the staging DB (project `asymnwikxyhipoezoggp`, confirmed by the user 2026-10-16): 32 passed, 2 skipped (DOKU live, opt-in). Year-2090 fixtures deleted (checked read-only).
- [x] `security-auditor` and `db-query-auditor` (2026-10-16). Fixed: 256 KB body limit (413) on both routes, try/catch around PayPal verification (503). The rest is under Open questions
- [x] QC via `pnpm dev` (automated through Playwright, not manual; see QC)
- [x] Version 1.3.0, CHANGELOG, touched docs (README, STRUCTURE, RELEASING, CLAUDE.md, security-auditor.md, note in TESTING_PLAN)
- [ ] Commit/tag/push (only with the user's go-ahead; the user asked for no git commands until told)

## Open questions

- **AC2, meaning of "without manual refresh".** A 30-second auto-refresh has been added (interpretation "without reload"). If the user is fine with a reload, remove `auto-refresh.tsx` and its use in `bookings/page.tsx`.
- **Audit findings that need a migration (rule 4, awaiting confirmation):** `@@index([provider, eventType, createdAt])` on `WebhookEvent` (the rejected-callback rate limit scans a whole provider), `@@index([createdAt])` for the default `/admin/webhooks` list, and `@@unique([provider, eventType, externalRef])` to close the find-then-create race in `beginWebhookEvent` (needs to exclude `signature.rejected` rows, and old duplicate rows block the migration). The impact of the race today is small: `recordPaymentAwaitingConfirmation` is idempotent.
- **Audit, not taken:** age check on the DOKU `Request-Timestamp` (DOKU's retry window is hours, needs checking first), `timingSafeEqual` for `CRON_SECRET`, a generic amount mismatch message to the gateway, auditing Retry when the booking is not found.
- **Communication to the reporter:** the label "Paid · awaiting confirmation" replaces "Waiting Confirmation"; "Confirmed" stays manual through `/admin/confirmations`.

## Next execution (deferred, 2026-10-16)

The user asked to execute later. Order when resumed:

1. Decide the AC2 question above; if auto-refresh is needed, add it + its unit/e2e tests.
2. `security-auditor` (the diff touches `src/app/api/webhooks/**`, `src/app/api/cron/**`) and `db-query-auditor`.
3. `pnpm test:e2e` after the user confirms the DB target (rule 4).
4. QC with `pnpm dev`: send mock DOKU callbacks (success, wrong signature, amount mismatch), check the label at `/admin/bookings`, the log + Retry at `/admin/webhooks`, the count at `/admin/diagnostics`. Record the results in the QC section.
5. Re-run `pnpm lint` + `pnpm typecheck`, `git grep` the docs (rule 7), then ask for a go-ahead to commit + tag `v1.3.0` (rule 5).

## QC

- Unit: 961 tests pass across 62 files (2026-10-16), including the new tests above (lint 0 errors, typecheck clean). All with mocks, no DB.
- E2E (2026-10-16, local dev server + staging DB): full suite 32 passed, 2 skipped. `admin-webhooks.spec.ts` (3 tests) covers the "Paid · awaiting confirmation" label in Bookings, the webhook log (list, Rejected callbacks tab, filter, Retry which rewrites the event status and attempts), and auto-refresh (booking status changed in the DB, clock advanced 31 seconds, row changed without reload). The spec at one point wrongly expected a "rejected" row on the default tab; the spec was fixed, not the page.
- Not verified: real or signed DOKU/PayPal callbacks (staging is in mock mode, endpoint 401), so webhook processing is covered by unit tests only; no manual clicking in the browser outside Playwright; the Retry button was only tested on simulated `payment.success` events; auto-refresh was not tested on a hidden tab.
- The `Decimal objects are not supported` warning in the dev server log comes from `BookingRow` (a client component) receiving raw Prisma objects; it is not from this change and was not changed.

## Implementation notes

- DOKU events are now created before the amount/booking is checked, so amount mismatch and booking not found show up in the log (`FAILED` / `SKIPPED`). Redelivery of a `FAILED` event reuses its row (attempts + 1) instead of creating a new one.
- The Xendit-shaped functions in `webhook-processor.ts` (`processInvoicePaid`, `processInvoiceExpired`, `processRefund*`, `dispatchWebhookPayload`) were removed: nothing called them except that faulty retry cron.
- Events stuck in `PROCESSING` for more than 5 minutes (`STUCK_PROCESSING_MS`) are reopened when the gateway redelivers. The cron and the Retry button claim events through an `updateMany` conditional on status, so they are not processed twice. `PAYMENT.CAPTURE.DENIED` does not reverse a payment that is already `SUCCESSFUL`.

## Cannot be verified

- Live DOKU/PayPal callbacks: staging runs in mock mode and `/api/webhooks/doku` answers 401 there (README "Environments"). This path is covered by unit tests only.
- `BK-2026-09-P6EXQV`: lives in production, must not be read. From the code it is impossible to tell "the webhook did not arrive" from "the normal gate". Check its Payment status in production, or through `/admin/webhooks` after the release.
