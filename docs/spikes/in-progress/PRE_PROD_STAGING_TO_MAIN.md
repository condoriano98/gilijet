# Release prep: everything on `staging` that is not in production yet

**Update 2026-10-30:** the merge this file prepared has happened: PR #6 (2026-10-25) and PR #7 (`70aabaa`, 2026-10-30 00:14 +0700), so `main` is at 1.10.3. The table below is the plan as of 2026-10-24, not rewritten. Whether each prerequisite (WhatsApp env vars and template, IMAP/SMTP, `seed:seasons`, `62` phone fix, cron logs) was done was not checked here, and production was not read. Confirm them, tick what is true, then move this file to `done/`.
**Status (2026-10-24):** planning. A `staging` → `main` merge is expected this week. This file lists what that merge ships and what must be ready before it. Nothing here has been done on production; production is untouched (rule 1).
**Source:** `git log origin/main..staging` (about 50 commits; `origin/main` is `88d0781` "hide incomplete return trip UI from main branch", it has no version tag), `CHANGELOG.md` (1.0.0 to 1.8.0), `docs/RELEASING.md`, the spike docs.

Production today is the pre-versioning `main`: no migrations table, no season calendar, no round-trip UI, WATI/Resend for messaging.

## 1. What ships (tickets still only on staging)

| Ticket / version | What production gets | Spike doc | Needs before merge |
|---|---|---|---|
| Round-trip booking (v1.1.0) + round-trip bugs | Return-trip UI, per-leg check-in, cancellation text for both legs | `FEATURE_RETURN_TRIP_BOOKING.md`, `BUGS_ROUND_TRIP.md` | Schema migration (section 2) |
| Seasonal pricing (v1.1.0) | LOW/HIGH/PEAK/OFF fares from a date calendar | `SEASONAL_PRICING_ANALYSIS.md` | Migration + `pnpm seed:seasons` after deploy; without the calendar, check what fares customers see |
| App versioning + Prisma migrations (v1.1.0) | `package.json` version, `/admin/diagnostics` build card, migrations instead of `db push` | `VERSIONING.md` | Production baseline (section 2) |
| Cancellation reason, reschedule requests (v1.1.1) | Reason in customer messages; reschedule request flow | CHANGELOG | none beyond the migration |
| Admin trip-type filter, round-trip fare breakdown (v1.2.0) | Admin bookings filter | CHANGELOG | none |
| Admin webhook log, DOKU/PayPal retry fix, paid-booking label (v1.3.0, v1.3.1) | `/admin/webhooks`; `retry-webhooks` now really records the payment | `BUG_PAYMENT_STATUS_WEBHOOK.md`, `BUG_DOKU_PAYMENT_CONFIRMATION.md` | Look at old `FAILED`/`PENDING` webhook rows first (section 4); `BUG_DOKU...` still says production verification and its open questions are unanswered |
| Cron secret now effective | `/api/cron/*` start running on the first deploy (`CRON_SECRET` is set in prod) | `RELEASING.md` | Check cron logs the next morning |
| E-ticket Part A: PIC WhatsApp on payment (v1.4.0, 1.7.x) | Operator PICs get the `order_masuk_operator` template when a booking is paid | `FEATURE_ETICKET_PIC_NOTIFICATION.md` | Meta env vars, approved template, published Meta app, `62` phone fix (section 3). v1.9.0 and v1.10.1: the message carries Gilifast's email and phone and prints `<name> <booking code>` on the contact line |
| WhatsApp moved from WATI to Meta Cloud API (v1.7.0) | All WhatsApp goes through Meta; WATI env vars are dead | same | **Customer-facing messages (payment received, boarding pass, cancellation) are session messages and probably will not be delivered in production** (open item, section 5) |
| E-ticket Part B: operator ticket email forwarded to customer (v1.4.0 to v1.6.0) | IMAP poll of the operator mailbox, forward to the buyer, "Check mailbox now" button | same | IMAP/SMTP env vars; live-tested on staging with a real Wahana email on 2026-10-24 (old format); v1.9.0 sends our own EN/ID text, not yet run live (section 5) |
| WhatsApp webhook (v1.8.0) | `/api/webhooks/whatsapp` delivery status in `/admin/webhooks` | same | Callback URL for the production domain in Meta; `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` |
| Fixes 1.7.1, 1.7.2 | Notifications kept alive with `after()`; Passengers column counts from the booking | CHANGELOG | none |
| Gilifast-written e-ticket email, EN/ID (v1.9.0) | The buyer gets our own text with the operator's PDF; language by the booking's nationality; subject `Your E-Ticket & Booking Confirmation - <code>` | `FEATURE_ETICKET_FORWARD_TEMPLATE.md` | Live run with a real Wahana email still to do |
| Check-in guide blog article (v1.10.0) | `/blog/wahana-virendra-checkin-guide`, linked from the e-ticket email | `FEATURE_BLOG_CHECKIN_GUIDE.md` | The email link points at the production domain: it is a dead link until this merge ships |

Not yet on staging either, so not in this merge unless done first: `FEATURE_SECURITY_CHECKS_CI.md` (planned, after the PIC task).

## 2. Database (blocks the merge)

- **Production baseline is not done.** The production build runs `prisma migrate deploy`; without `migrate resolve --applied 0_init` first it fails with `P3005` (`RELEASING.md`, "Production database"). Steps: backup, read-only schema diff against `main`'s schema, check RLS on `OperatorPicContact`, then the resolve. Needs the owner's go-ahead and the production URL (rules 1 and 4).
- Migrations that go live with the merge: `0_init` (baseline only) and `1_round_trip_and_seasonal_pricing` (additive, plus one `DROP NOT NULL` on `Booking.legId`). Read the SQL in the PR.
- After the deploy: `pnpm db:status` against production, then `pnpm seed:seasons` (2026/27 season calendar).
- Production PIC phone numbers need the `62` prefix fix (memory: PIC phone prod fix). Do it together with this batch; the production PIC rows must be the real Wahana numbers, not the tester's.

## 3. Production environment variables (Vercel project `gilifast`, Production scope)

Check each; the staging values do not carry over. Values are never written here.

- WhatsApp (Meta): `WHATSAPP_ACCESS_TOKEN` (permanent system-user token), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_TEMPLATE_LANG`, `WHATSAPP_TEMPLATE_ORDER_NOTIF`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (new, strong), `WHATSAPP_APP_SECRET`. The old `WATI_*` can go.
- Email: `SMTP_HOST/PORT/USER/PASSWORD`, `EMAIL_FROM` (replaces Resend). Outbound SMTP from Vercel was verified on staging only.
- Operator mailbox: `INBOX_IMAP_HOST/PORT/USER/PASSWORD`, `INBOX_POLL_SINCE`, `INBOX_POLL_LIVE` (keep `false` until the live test passes).
- `APP_BASE_URL`: staging currently shares the production entry (links in staging emails go to the production domain). Production keeps its own; give `staging` a separate entry. **Done 2026-10-25** in Vercel (Production `https://www.gilifast.com`, `staging` `https://gilijet.vercel.app`); it takes effect only with the next deployment, so the merge also turns `robots.txt` and the canonical on `www.gilifast.com` from `Disallow: /` / gilibali.com to crawlable / gilifast.com. Check them after the release (`FEATURE_SUNSET_GILIBALI.md`).
- `CRON_SECRET` already set (2026-10-14). `ADMIN_WHATSAPP_NUMBER` and the staff alert template take nine positional variables (see `/admin/console/alerts`).
- Meta side: callback URL `https://www.gilifast.com/api/webhooks/whatsapp` with the production verify token, and the Meta app **published** so non-test numbers receive messages.

## 4. Undo the staging test setup first (none of it is in code)

- DOKU Back Office (brand gilifast.com) QRIS Notify URL: back to `https://www.gilifast.com/api/webhooks/doku`. Until then production QRIS payments are not reported to production. **Must be done before the merge, not after.**
- Delete/regenerate the Vercel Protection Bypass secret; update the Meta callback URL that carries it.
- Staging DB: the PIC table already matches production (2026-10-24: two Wahana rows and the platform row, test rows removed). Still temporary on staging: `INBOX_POLL_LIVE=true` (Vercel `staging`), and the hand-added Rp 2 Wahana-boat schedules (Padang Bai → Senggigi 07:00 and Senggigi → Padang Bai 13:00; they live only in the staging database).
- Rotate secrets that were pasted in chat: WhatsApp token, app secret, verify token, bypass secret, Gmail app password.
- Look at old `FAILED`/`PENDING` webhook rows in production before the first `retry-webhooks` run.

## 5. Open product issues that decide what we say "yes" to

- Customer WhatsApp (payment received, boarding pass, cancellation) needs approved UTILITY templates; today those are session messages, likely undelivered outside the 24h window. Decide: ship with email only for customers, or write the templates first. Also subscribe the `messages` field and confirm the theory.
- Part B ran live on staging against a real Wahana email on 2026-10-24 (old format): the code in the greeting matched and the PDF was forwarded. The v1.9.0 format (our own EN/ID text) has not run live yet; the guide link in it works only after this merge.
- Business questions: two tickets for the customer (operator PDF and our boarding pass); should the operator's ticket email itself confirm the seat; who confirms; the "first PIC wins" idea.
- E2E not yet run for `admin-bookings-filter.spec.ts` (Passengers) and `whatsapp-webhook.spec.ts` (they write to the staging DB, need a go).
- Spike docs to mark "deployed vX.Y.Z" and move to `docs/spikes/done/` after the release (`RELEASING.md` step 6): all rows of section 1.

## 5b. Making Part B (operator ticket email) actually run in production

Merging alone does **not** start it. Three things are closed on purpose (decided 2026-10-24, nothing changed in code yet):

1. **Schedule.** Done 2026-10-25 (uncommitted until the user approves): `vercel.json` now has `{ "path": "/api/cron/poll-operator-inbox", "schedule": "*/5 * * * *" }` next to `retry-webhooks`, `topup-legs` and `refresh-fx`; it ships with the merge (the team is on Pro so 5 minutes is allowed; Vercel only runs crons on production, so staging is unaffected). Env vars cannot start it.
2. **`INBOX_POLL_LIVE` is not `true`**, so any poll is a dry run (reads and reports, forwards nothing). Production already has `INBOX_IMAP_*`, `SMTP_*`, `EMAIL_FROM`, `CRON_SECRET`; it has neither `INBOX_POLL_SINCE` nor `INBOX_POLL_LIVE`.
3. **Sender match.** Only a sender equal to a PIC row's `emailKonfirmasiTrigger` is processed (Wahana row 1: `no-reply@virendrafastferry.com`; Wahana row 2 has none).

Order: merge with it in dry run → set `INBOX_POLL_SINCE` to the day of the release (without it the first poll looks back up to 7 days) → "Check mailbox now" at `/admin/eticket-delivery`, read the dry-run result with a real Wahana email → set `INBOX_POLL_LIVE=true` and redeploy → then the cron entry, if it was not added with the merge. Still unproven: where the booking code appears in Wahana's real email; if absent, the match falls back to name plus departure time, and otherwise the admin picks the booking at `/admin/webhooks`. Not checked: whether a dry run marks mail as read in the mailbox.

## 6. Release order (draft)

1. Section 4 reverts and section 3 env vars ready.
2. Staging `/admin/diagnostics` shows the intended version and commit (v1.10.1 plus whatever lands before; tags v1.9.0, v1.10.0 and v1.10.1 exist locally, push them with the release).
3. Production backup, baseline (`migrate resolve --applied 0_init`), schema diff clean.
4. PR `staging` → `main`; read the migration SQL; the two separate warnings and go-aheads (`CLAUDE.md` rule 9) before any merge.
5. Check the build log for `[db-migrate] OK`; `pnpm db:status`; `pnpm seed:seasons`; PIC phone fix.
6. Check gilifast.com `/admin/diagnostics`, one real paid booking end to end, cron logs next morning.
7. Docs: mark spikes deployed and move them; `CHANGELOG.md` has the version sections already.
