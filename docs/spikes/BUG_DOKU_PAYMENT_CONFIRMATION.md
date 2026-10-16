# Bug: DOKU payment confirmation, status stays "awaiting confirmation"

**Status (2026-10-16):** Plan A implemented (v1.3.1): code, unit tests (963 pass), e2e `admin-webhooks.spec.ts` (4 pass, staging), lint, typecheck. **Not yet:** production verification (off-limits without permission), commit + tag `v1.3.1` (awaiting go-ahead, rule 5), release to `main`. The open questions below are not yet answered; Plan A was run on the instruction "continue the implementation".

**Related:** `docs/spikes/BUG_PAYMENT_STATUS_WEBHOOK.md` (v1.3.0, already on `staging`, not yet on `main`).

## Report

Ticket "Payment Confirmation":

1. The system captures the callback/webhook status from the payment gateway (success/failure).
2. Once a "success" status is received, the system changes the booking status from pending → paid. **Currently it is still "awaiting confirmation"** (the reporter already tried a real payment). The reporter's suspicion: it is not connected to the payment gateway webhook.
3. A "Payment Successful" page/pop-up appears automatically after the status is updated, without a manual refresh. **Already DONE** according to the reporter.

Only point 2 needs fixing (and point 1 insofar as point 2 depends on it).

## Initial findings (from the code, not yet verified in production)

1. **Real payments can only happen in production.** Staging runs DOKU in mock mode (`README.md` "DOKU has no sandbox account"; `docs/spikes/DOKU_ONE_RUPIAH_STAGING.md` "Blocker"). So the reporter's "real" test was almost certainly on gilibali.com, which runs `main`.
2. **In live mode, the only path for DOKU from `PENDING_PAYMENT` to `AWAITING_CONFIRMATION` is a validated webhook.** `recordPaymentAwaitingConfirmation` is called from: the DOKU/PayPal webhook (`webhook-processor.ts`), the PayPal capture at the return URL (`psp.ts`), the PayPal rescue at expiry (`expiry.ts`), and the dummy checkout (mock only, `checkout/[reference]/page.tsx`). There is no status polling to DOKU. This means: **if a DOKU booking has status `AWAITING_CONFIRMATION`, its webhook has already arrived and been processed.** If the webhook fails, the booking stays `PENDING_PAYMENT` and then becomes `EXPIRED`.
3. **"Awaiting confirmation" is the status intended after payment, not a sign of failure.** The payment → ticket gate rule (`CLAUDE.md`, `src/features/tickets/ticket-issuer.ts`): money arriving only moves the booking to `AWAITING_CONFIRMATION`; tickets are issued after an admin phones the operator at `/admin/confirmations`. There is no `PAID` status in the `BookingStatus` enum. This flow was confirmed to remain in use (session 2026-10-16, previous ticket).
4. **What the reporter sees is most likely the raw enum label.**
   - Customer page `/b/[reference]` shows the badge `booking.status.replace(/_/g, ' ')` → **"AWAITING CONFIRMATION"** (`src/app/(customer)/[locale]/b/[reference]/page.tsx:293-294`), even though the card below it already says "Payment received — we're confirming your seat". This badge was not touched by v1.3.0.
   - Admin `/admin/bookings`: v1.3.0 already changed the label to "Paid · awaiting confirmation", but only on `staging`. Production (`main`, commit `88d0781`) is far behind `staging` (v1.1.1 through v1.3.0 are missing), so production admin still sees "AWAITING CONFIRMATION".
5. **Production also lacks the v1.3.0 webhook fixes**: the `/admin/webhooks` log, the retry cron for DOKU/PayPal, recording of rejected callbacks, 413/503. If a webhook really fails in production, nothing retries it today and there is nowhere to see it.

**Interim conclusion:** the DOKU webhook most likely already works; the problem is that the "awaiting confirmation" label reads like "not yet paid", plus an expectation of a "paid" status that does not exist in the design. This needs to be proven with production data (see Verification), not assumed.

## Required verification (production, needs explicit permission)

Everything below touches production, so it is off-limits until the user allows it (`CLAUDE.md` rule 1). All of it is **read-only**.

1. Ask the reporter for: the booking reference of the payment test, the payment time, the method (QRIS/VA/card), and a screenshot of the page where they saw "awaiting confirmation" (customer `/b/...` or admin).
2. Check the booking row + `Payment` in the production DB: `Payment.status` should be `SUCCESSFUL`, with `paidAt` and `gatewayReference` filled. If so → the webhook succeeded, finding 2 is proven.
3. Check the Vercel production runtime logs for `POST /api/webhooks/doku` around the payment time: status 200 vs 401 (wrong signature/notification URL), 409 (amount mismatch), 5xx.
4. Check the production `WebhookEvent` table for that reference (the table already exists; only its UI is not yet in production).

If it turns out the booking is still `PENDING_PAYMENT`/`EXPIRED` even though DOKU says success, this is a real webhook bug and the plan changes to "Plan B".

## Plan A — webhook proven to work (main hypothesis)

1. **Customer badge** `/b/[reference]`: replace the raw enum with a clear label, e.g. `AWAITING_CONFIRMATION` → "Paid · confirming your seat" / "Payment received" (following the existing locale i18n), `PENDING_PAYMENT` → "Awaiting payment", etc. Create `customerBookingStatusLabel` in `src/features/booking/status-label.ts` next to `adminBookingStatusLabel`, one source of labels.
2. **Find other places that show the raw enum** to customers: email/WhatsApp (`src/features/booking/notifications.ts`), the customer account page (`/account`), PDF/CSV. `git grep "status.replace"` and `git grep "AWAITING_CONFIRMATION"` in `src/app/(customer)` and `src/features/messaging`.
3. **Release to production**: PR `staging` → `main` so that v1.3.0 (admin label, webhook log, DOKU/PayPal retry) + this fix reach gilibali.com. Note: production is many versions behind, including Prisma migrations; the production build runs `prisma migrate deploy` (rule 9, `docs/RELEASING.md`).
4. **Explain to the reporter**: "Paid" is automatic from the webhook (status `AWAITING_CONFIRMATION` = already paid); "Confirmed" + tickets stay manual through admin. If the business wants tickets issued immediately without phoning the operator, that is a flow change (see Plan C), not a bug.

Version: label fix → PATCH (v1.3.1).

## Plan B — the webhook really fails in production

Depends on the log results:
- **401**: the notification URL in the DOKU Back Office is not exactly `{APP_BASE_URL}/api/webhooks/doku`, or the production `DOKU_SECRET_KEY`/client id is wrong. The fix is in DOKU/Vercel configuration, not code. After v1.3.0 is in production, these callbacks are recorded in the "Rejected callbacks" tab.
- **409 amount mismatch**: check the rounding of `totalAmount` vs DOKU's `order.amount` (e.g. service fee/promo).
- **No request at all**: the notification URL has not been set in the DOKU Back Office.
- **5xx**: read the error, fix in `webhook-processor.ts`; the v1.3.0 retry cron will reprocess.

Recovering bookings that were not updated: Retry at `/admin/webhooks` (after v1.3.0 is live) — needs permission because it writes to the production DB.

## Plan C — the business wants a separate "paid" status or automatic tickets (not a bug)

Only if the reporter/owner actually requests a flow change:
- C1: a new `PAID` status in the enum → migration + change every place that reads `AWAITING_CONFIRMATION`. We do not recommend it: it means the same as `AWAITING_CONFIRMATION`, only the label is needed.
- C2: tickets issued immediately after payment (skipping the operator phone call) → violates the payment → ticket gate in `CLAUDE.md`; needs an owner decision and an update to `CLAUDE.md`.

## Open questions

1. Where does the reporter see "awaiting confirmation": the customer page `/b/...`, admin bookings, or email/WhatsApp?
2. What is the booking reference of the real payment test, and may it be checked read-only in production (DB + Vercel logs)?
3. Is the expected "paid" just a label (Plan A), or really a different status/flow (Plan C)?
4. Ticket point 3 ("Payment Successful" pop-up, DONE): where is it implemented? No status polling was found on the customer page in this repo (`/b/[reference]` is a server component without auto-refresh). If it was built in another branch/repo, we need to know so as not to conflict.

## Checklist (after the questions are answered)

- [ ] Read-only production verification (with permission) — not yet, so the hypothesis "the webhook already works" is not proven
- [x] Choose Plan A
- [x] `customerBookingStatusLabel` in `status-label.ts`; used in `/b/[reference]` and `/account` (step 1)
- [x] Unit test `tests/unit/features/booking/status-label.test.ts`
- [x] E2E: new test in `tests/e2e/admin-webhooks.spec.ts` (`AWAITING_CONFIRMATION` booking, year-2090 fixture, checks the `/b/[ref]` badge; fixture cleaned up)
- [x] Docs + `CHANGELOG.md` 1.3.1 + `package.json` (rules 7, 8)
- [ ] Commit/tag/push `staging` with confirmation (rule 5); PR to `main` with two warnings (rule 9)

## QC

- `pnpm lint` 0 errors (1 existing warning in `postcss.config.mjs`); `pnpm typecheck` clean; `pnpm vitest run` 963 pass (62 files).
- `pnpm exec playwright test tests/e2e/admin-webhooks.spec.ts`: 4 pass against the staging DB (`asymnwikxyhipoezoggp`), including the new test that loads `/b/BK-2090-06-WHKPD1` and sees "Paid · confirming your seat", without "AWAITING CONFIRMATION". The fixture is deleted by `afterAll`.

**Not verified:** manual clicking in the browser (Playwright only), the `/account` page visually (typecheck only; the label is tested in the unit test), languages other than English (the page does not use i18n for the status badge), email/WhatsApp (none found that show the raw enum), the operator page `/operator/penjualan` (still the raw enum; operators do not use the app), production (off-limits) so the hypothesis that the DOKU webhook already works is not proven. The e2e server log shows the existing "Decimal objects are not supported" warning from the admin page; it is not from this change.
