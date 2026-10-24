# Feature: e-ticket issuance — PIC WhatsApp on payment, operator ticket email forwarded to the customer

**Status (2026-10-20):** Part A (PIC WhatsApp on payment) is committed (`c5c3071`). Part B was committed as `9333eb0` on Resend inbound and then moved to **IMAP polling + Gmail SMTP** (release 1.5.0, committed and pushed to `staging`, tag `v1.5.0`; 1.6.0 adds the Check mailbox now button and `INBOX_POLL_SINCE`; see "Checkpoint"). Unit, lint, typecheck, e2e on staging and a read-only dry run against the real mailbox are done. Not yet verified: a real SMTP send and a live (non-dry) poll; that is the manual test on staging. `main`/production are untouched.
**Created:** 2026-10-17
**Target version:** 1.4.0 (MINOR: new notification + inbound email feature). No schema change.
**Ticket:** "4 Penerbitan E-Tiket".

## Checkpoint (implementation, updated as it goes)

**Last updated 2026-10-20 (end of day; v1.6.0 = button + INBOX_POLL_SINCE, tagged and on `staging`).** **Next step:** the live send test on staging (needs the tester's sender address, the test customer address and the go to set `INBOX_POLL_LIVE=true` on the Vercel staging environment). The user said "implement" on 2026-10-20. Order: 1 SMTP → 2 Part B fixes → 3 IMAP poller → 4 cleanup of Resend → 5 QC and docs sweep. Committed and pushed to `staging` as v1.5.0 (user's go, 2026-10-20); `main` is untouched.

| Step | State |
|---|---|
| 0 Libraries: `nodemailer` 10.1.7, `imapflow` 2.5.8, `mailparser` 3.10.0 (+ `@types/nodemailer`, `@types/mailparser`), exact versions | done |
| 1 SMTP transport: `src/features/messaging/mailer.ts` (`sendMail`, never throws), `email.ts` uses it for all 7 sends, `SMTP_*` / `EMAIL_FROM` in `env.ts`; tests `mailer.test.ts`, `email.test.ts` | done, unit tests pass |
| 2 Part B fixes: claim released on any thrown send error and the send is retried cleanly; an email with no PDF goes to Needs review; unauthenticated sender goes to Needs review (admin pick bypasses); dry-run mode in `processOperatorTicketEmail` | done, unit tests pass (`operator-ticket-email.test.ts`, 25 tests) |
| 3 IMAP poller: `messaging/inbox.ts` (IMAP read-only, MIME parse, `isAuthenticated`), `tickets/operator-ticket-inbox.ts` (`pollOperatorInbox`), route `/api/cron/poll-operator-inbox`, `.github/workflows/poll-operator-inbox.yml`, `INBOX_POLL_LIVE` (default off = dry run) | code and unit tests done; not yet run against the real mailbox |
| 4 Resend removed: inbound route, `resend-inbound.ts`, their tests, `RESEND_API_KEY`, `RESEND_INBOUND_SECRET`; provider key is now `imap-inbox` | code done; docs sweep still todo (step 5) |
| 5a Docs sweep, `CHANGELOG.md` 1.5.0, `package.json` 1.5.0, `.env.example`, README, STRUCTURE, CLAUDE.md, security-auditor agent, pic-contacts doc | done (grep for `resend`/`svix` finds only intentional historical mentions) |
| 5b Unit (69 files, 1082 tests), lint (0 errors, 1 old warning), typecheck, `next build` compile | done and passing (re-run after the review fixes) |
| 5b2 code-reviewer and security-auditor agents; their findings fixed | done, see "Reviews of the IMAP change" |
| 5c Dry run against the real mailbox via the dev server | done, see "QC 2026-10-20" |
| 5d e2e `eticket-operator-email.spec.ts` (rewritten for IMAP) and `eticket-pic.spec.ts`, `customer-booking.spec.ts` on the staging DB | done 2026-10-20 with the user's go: all pass, fixtures removed (read-only count afterwards: 0 left) |
| 5e Commit, push to `staging`, tag `v1.5.0` | done 2026-10-20 with the user's go (see the commit); `main` untouched |
| 5e2 Tags `v1.5.0` (`acc6092`) and `v1.6.0` (`cf37d34`, button + `INBOX_POLL_SINCE`) created and pushed 2026-10-20 | done |
| 5f Manual test on staging after the push | todo, user + Claude (see "Manual test plan") |
| 6a **"Check mailbox now" button** on `/admin/eticket-delivery` (server action `checkMailboxNowAction`, `requireAdmin()`, same `pollOperatorInbox` as the cron route, `maxDuration` 60) | done 2026-10-20 (user chose option 2): guard test, e2e (no mailbox configured), and a real run in the dev server against the real mailbox: dry run, 6 s, "0 new" |
| 6b Automatic scheduling on staging | not done: Vercel Cron cannot run on staging; the button and manual calls are the staging way. Production scheduling is deliberately not set up (user's decision); `CRON_SECRET` set on the target deployment; `INBOX_POLL_LIVE=true` only after a clean dry run; rotate the app password | todo, user |

**Design changes made while building (differs from "Decision 2026-10-19" above):**
- **No `\Seen` flags and no writes to the mailbox.** People read this inbox, so a mail opened in Gmail must not vanish from the poller. "Handled" is a `WebhookEvent` row keyed by the Message-ID; the poller searches the last 7 days from the operators' confirmation addresses and skips known Message-IDs (envelope fetched first, body only for new mail). The IMAP lock is always read-only.
- **Dry run is the default**, switched off only by `INBOX_POLL_LIVE=true` (exactly that string). It runs the real matcher and reports `dry-run: would forward to booking … (matched by …)` without sending or writing anything.
- **Sender authentication:** only the topmost `Authentication-Results` header written by `mx.google.com` counts; DMARC pass, or DKIM pass aligned with the From domain. Otherwise Needs review (an admin's pick may override).
- **Retries and the admin pick re-read the message from the mailbox** by `(UIDVALIDITY, UID)` stored in the event; if the mailbox was reset or the message deleted, the retry fails visibly.
- **The poll route is not scheduled anywhere yet.** (Updated 2026-10-20: the GitHub Actions workflow planned here was removed. The team is on Vercel Pro, but Vercel Cron only runs on production and the user wants staging only for now, so on staging the poll runs from the admin "Check mailbox now" button or by hand. See "Scheduling, 2026-10-20".)

**Scheduling decision (updated 2026-10-20):** the Vercel team is on **Pro**, but Vercel Cron only runs on production, and the user wants staging only for now: nothing is scheduled yet. The earlier Hobby / GitHub Actions plan is withdrawn; see "Scheduling, 2026-10-20" below.

## Status note 2026-10-22: WhatsApp moved from WATI to the Meta Cloud API (v1.7.0)

Everything above that says WATI, `PIC_ORDER_TEMPLATE` or `sendTemplateMessage` via WATI is outdated. The PIC "order paid" message now goes through the Meta WhatsApp Cloud API (`src/features/messaging/whatsapp.ts`) with the approved template `order_masuk_operator` (Meta, 2026-10-22: APPROVED, language `id`, UTILITY, 9 positional variables: booking code, boat, route, date and time, buyer name, email, phone, passenger count, passenger list). Env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_ORDER_NOTIF` (+ optional `WHATSAPP_API_VERSION`, `WHATSAPP_TEMPLATE_LANG`). These five were added to the Vercel `staging` environment on 2026-10-22; they take effect with the first `staging` deployment that contains v1.7.0.

Checked read-only on 2026-10-22: the staging database has one PIC row (PT WAHANA VIRENDRA GROUP, with a real notification number) and no platform row, and `PlatformConfig.dokuMode` is `LIVE`, so a payment test on staging charges real money (use the Rp 1 departure). The template header still says "nama, gender, usia, kewarganegaraan" while the message sends name, category, nationality (no gender). No WhatsApp webhook route exists (`/api/webhooks/whatsapp` is not built); delivery status and replies are not tracked, sending does not need it.

### Finding 2026-10-22: the PIC message was never sent after a real payment (fixed in v1.7.1)

First live QRIS payment on staging (booking `BK-2026-10-UFHYDF`, Rp 1): the DOKU webhook arrived (notify URL switched to staging, Vercel protection bypass), the event was `PROCESSED` and the booking went to `AWAITING_CONFIRMATION`, but no `pic_order_notified` audit row and no `[pic-notify]` log appeared; the only related log line was the customer email's SMTP `Connection timeout` surfacing 37 s later on an unrelated `GET /api/auth/me`. Cause: `webhook-processor.ts` / `psp.ts` fired `notifyPaymentReceived` without awaiting it, and `notifyPaymentReceived` itself fired the staff alert and the PIC message with `void`. On Vercel the function is frozen once the response is sent, so that work is dropped or resumes on a later request. Fix: `src/shared/server/after-response.ts` (`after()` from `next/server`) keeps the function alive for the notification, and `notifyPaymentReceived` now awaits the staff and PIC messages (started before the customer email so a slow SMTP does not hold them back). Cause is inferred from the evidence above, not reproduced in isolation; the proof is the next real payment. Also seen: SMTP from Vercel to Gmail:465 timed out once, not yet explained (freeze artifact or a real block).

### 2026-10-22: WhatsApp webhook callback URL not validated in Meta (route built in v1.8.0; verification in Meta still to be confirmed)

> **Update 2026-10-22:** `/api/webhooks/whatsapp` is built in v1.8.0 (`src/app/api/webhooks/whatsapp/route.ts`, helpers in `src/features/messaging/whatsapp-webhook.ts`; `GET` hub challenge, `POST` HMAC check, statuses logged as `WebhookEvent` provider `whatsapp`). `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET` were added to the Vercel `staging` environment. Callback URL to enter in Meta: `https://gilijet.vercel.app/api/webhooks/whatsapp?x-vercel-protection-bypass=<bypass secret>`. Whether Meta accepts it is not verified yet; the original problem description follows.

In the WABA dashboard (Meta app "Gilifast Booking" → WhatsApp → Configuration → Webhook) the callback URL `https://gilijet.vercel.app/api/webhooks/whatsapp` with verify token `order_wawebhookverifytoken` shows "The callback URL or verify token couldn't be validated". Two causes, both known: (1) the route does not exist (`src/app/api/webhooks/` has only `doku` and `paypal`; no `/api/webhooks/whatsapp`, no verify-token or `X-Hub-Signature-256` handling, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` / `WHATSAPP_APP_SECRET` are not read anywhere); (2) staging is behind Vercel Authentication, so Meta's GET is answered with a 302 to SSO; a Protection Bypass for Automation secret in the query string (`?x-vercel-protection-bypass=<secret>`, already proven for DOKU) gets past it. Sending the PIC template works without this webhook (confirmed 2026-10-22: the message reached the tester's phone); the webhook only adds delivery status (`sent`/`delivered`/`read`/`failed`) and inbound replies. To do: build `GET` (hub challenge when `hub.verify_token` matches) and `POST` (HMAC-SHA256 of the raw body with the app secret, 256 KB cap, event rows in `WebhookEvent` provider `whatsapp`, shown in `/admin/webhooks`), add `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET` to the Vercel `staging` environment (use a long random verify token; the app secret was pasted in chat, rotate it), put the bypass secret in the callback URL, then "Verify and save" in Meta. MINOR bump (v1.8.0).

Also noted 2026-10-22: the Meta app is still in development (unpublished) mode ("Apps will only be able to receive test webhooks … while the app is unpublished"), so messages reach only numbers registered as test recipients. Publish the app before the real Wahana PICs are meant to receive messages.

### Open issue 2026-10-22: customer-facing WhatsApp (payment received, boarding pass) does not reach the customer

Staging, booking `BK-2026-10-UFHYDF`, confirmed at `/admin/confirmations` on 2026-10-22: the boarding pass email arrived (Gmail), the WhatsApp did not. The server logged no send failure. Likely cause (not yet proven by a delivery status): payment-received, boarding-pass and cancellation WhatsApp messages are plain **session messages**, which WhatsApp delivers only inside 24 hours of the customer writing to the business number; Meta accepts the request and then fails it asynchronously, so the app cannot see it. Only the PIC message works, because it is an approved utility template. In production almost no customer will have written first, so these messages would mostly not be delivered. Test to prove it: write from the customer's number to the business number (`+62 813-5777-701`), then confirm another paid booking and check that the pass arrives; and subscribe the `messages` field in the Meta webhook so a `failed` status (131047) shows in `/admin/webhooks`. Proper fix (needs a business decision): approved UTILITY templates for payment received and for the boarding pass (document header), sent through `sendTemplateMessage`; templates are positional, so parameter order matters. Also open for the business: the customer can receive both the operator's ticket PDF (forwarded by Part B) and our boarding pass after confirmation; which one is the ticket at boarding, and whether the operator's ticket email should itself count as the seat confirmation.

Verified the same day: outbound email over SMTP from Vercel works (payment-received and boarding-pass emails arrived), and the staging `APP_BASE_URL` still points to the production domain (links in emails go to gilibali.com); not yet changed.

### Checkpoint 2026-10-22 (end of day): what is done, what is temporary, what is next

**Done and verified on staging today:** the PIC "order paid" WhatsApp reaches the tester's phone (Meta Cloud API, template `order_masuk_operator`, v1.7.0; needed v1.7.1: `after()` so the function is not frozen before the notifications finish); payment by QRIS reaches staging through a DOKU webhook (event `PROCESSED`, booking `AWAITING_CONFIRMATION`); the Passengers column fix (v1.7.2); the WhatsApp webhook route (v1.8.0, Meta verified the callback URL); outbound email over SMTP from Vercel works (payment-received and boarding-pass emails arrived).

**Temporary test setup that must be undone** (none of it is in code):
- DOKU Back Office, brand `gilifast.com`, QRIS Notify URL: changed to `https://gilijet.vercel.app/api/webhooks/doku?x-vercel-protection-bypass=<secret>`. **Restore `https://www.gilifast.com/api/webhooks/doku`**; until then QRIS payments made on production are not reported to production.
- Vercel project `gilifast` → Deployment Protection → Protection Bypass for Automation ("For Payment Testing"): delete or regenerate when the tests are over; the secret is in the DOKU and Meta callback URLs and was pasted in chat.
- Meta webhook callback URL carries the same bypass secret.
- Staging database: one `OperatorPicContact` platform row (`operatorId` null) and the Wahana row both hold the tester's number (`6285246052359`); the real Wahana PIC number is no longer on staging. Restore from `trigger_tiket.csv` (via `scripts/seed-pic-contacts.ts` logic) before any test that should reach the real PIC.
- Secrets pasted in chat to rotate before go-live: WhatsApp access token, app secret, verify token (weak), the Vercel bypass secret, the Gmail app password (earlier).

**Open, in the order they should be taken:**
1. Staging `APP_BASE_URL` points to the production domain (links in emails go to gilibali.com): give `staging` its own entry (`https://gilijet.vercel.app`); the current entry is shared with production.
2. Part B live test with a real Wahana email: needs a paid Wahana-operator booking on staging (a test booking inserted in the staging DB is proposed, not a real DOKU payment), `INBOX_POLL_LIVE=true` on staging, then "Check mailbox now" (dry run first). Still unknown: where the booking code appears in Wahana's email (the PIC template says "kolom catatan tiket", the matcher reads the greeting).
3. Customer-facing WhatsApp needs approved templates (see the open issue above); subscribe the `messages` webhook field in Meta.
4. Publish the Meta app (it is unpublished, so only registered test numbers receive messages) before the real Wahana PICs are meant to receive them.
5. Production: PIC phone fix (`62` prefix), the production database baseline, then the `staging` → `main` release with the two warnings (`docs/RELEASING.md`, `CLAUDE.md` rule 9).
6. Questions for the business: two tickets for the customer (operator PDF plus our boarding pass), whether the operator's ticket email should itself confirm the seat, who confirms (admin phone call vs PIC WhatsApp reply), the "first PIC to answer wins" idea.
7. E2E not run today (they write to the staging DB and need confirmation): `admin-bookings-filter.spec.ts` (new Passengers test) and `whatsapp-webhook.spec.ts`.

## Ticket (translated)

E-tickets are generated automatically (PDF / web page) with name, route, schedule, booking number and a check-in QR code. Flow:

1. **After the customer pays**, the system automatically sends a WhatsApp to the numbers in the "trigger_tiket" data:

   ```
   Booking Code Gilifast : BK-xxx-xxxx
   Passenger : 3 Person
   Anita Female/Adult/Argentina
   Boris Male/Adult/Indonesian
   Suli Male/Child/Argentina
   Boat : PT WAHANA VIRENDRA GROUP
   Rute : {Departure} to {Arrival}
   Date & Time :
   ```

   The message is **information only**: a fully paid order came in. Recipients: rows with `companyname` = the boat the customer chose (e.g. PT WAHANA VIRENDRA GROUP) and GILIFAST, `no_hp` where `status` = "Notifikasi".

2. **Behind the scenes**, everyone who received the notification opens the Wahana dashboard and creates the ticket with the customer's real name, nationality, departure/arrival port and departure time. Wahana then emails it to admin@gilifast.com, from the `email` with `status` = "Konfirmasi" for that `companyname`. The email has:
   - the ticket PDF as an attachment;
   - the customer name in the body, implicitly in the greeting (e.g. "Hi Andi ABCD" → customer name "Andi ABCD"), **keyword 1**;
   - the departure and arrival date and time in the body, **keyword 2**.

3. Using keyword 1 (= `Booking.customerName`) and keyword 2 (departure date/time), find the customer's real email and phone in the Supabase table `Booking`, then forward the email with these changes:
   - **Subject:** remove "Fwd: " and append `_{bookingReference}` of the matching booking.
   - **Body:** remove the "------ Forwarded Message ------" block and add `Gilifast Booking code : {bookingReference}`.
   - **Recipient:** the customer's real email from the matching `Booking`.

## Decisions (user, 2026-10-17)

- **The forward does not change the booking.** It stays `AWAITING_CONFIRMATION` and the admin still confirms at `/admin/confirmations`. The payment → ticket gate in `CLAUDE.md` is unchanged.
- **PIC message content:** booking code, pax count, and per passenger the name, category (Adult / Child / Infant) and nationality; boat company; trip type (one way / round trip); route; departure date and time (plus the return leg for a round trip). **No gender**, so the booking form does not change.
- **Nationality** is `Booking.customerNationality` for every passenger, because the form collects one nationality per booking (see open question 4).
- **Recipients** come from `OperatorPicContact` (`docs/pic-contacts.md`), which is the seeded `trigger_tiket.csv`:
  - "status = Notifikasi" maps to `nohpNotifikasi`;
  - "status = Konfirmasi" maps to `emailKonfirmasiTrigger`;
  - GILIFAST is the row with `operatorId = null`.

## Decision 2026-10-17 (user): the Gilifast booking code is printed in the greeting

Wahana cannot change its dashboard or its email template, but the PIC types the customer's name into the dashboard by hand, and the PIC takes that name from **our** WhatsApp. So we control what gets typed. The user will confirm with the Wahana team that the PIC types our booking code after the name, so the greeting of the Wahana email reads `Hi <name> <Gilifast booking code>,` (example from the user: "Hi andy bk-29839-jdkr7"). The screenshot in the revision below is the *current* email, before this change; no sample with the code exists yet.

Consequences (this supersedes the layered name/time matching below, which stays as the fallback):

- **Primary match is exact:** extract our code from the greeting and look it up in `Booking.bookingReference`. The code is typed by hand, so extraction is case-insensitive and tolerates a stray space or dash. Our real format is `BK-YYYY-MM-XXXXXX` (`src/features/booking/references.ts`; the suffix alphabet has no I, O, 0 or 1), so the example `bk-29839-jdkr7` is only illustrative.
- **Safety checks stay:** the sender must be an active `emailKonfirmasiTrigger`; the booking must belong to that operator and be paid (`AWAITING_CONFIRMATION` or `CONFIRMED`). Wahana's own code (`BK-260915-UZ1XEB`) is also in the email body, but it never matches a Gilifast booking of that operator, so it cannot be confused with ours.
- **Name and departure time** are no longer match keys. They become a sanity check: a mismatch with the booking is logged, not fatal.
- **No code, mistyped code, or code of another operator's booking:** nothing is forwarded; the `WebhookEvent` is `FAILED` and an admin picks the booking with one click.
- **Round trip:** one code can arrive in two emails (one per leg). The departure date/time in the email says which leg; each (booking, leg) is forwarded once.
- **Still needed:** the PIC WhatsApp must give the code in a copy-paste form, and the PDF probably also prints the code if the PIC types it into the name field (open question 6).

## Revision 2026-10-17: real email and GIL-39 setup note

**The real Wahana email** (screenshot from the user): greeting "Hi test,", a booking code in **Wahana's own format** (`BK-260915-UZ1XEB`, not ours), then `Sanur → Nusa Penida · 22 Jul 2027 07:00 · Wahana Virendra Rose`, with the PDF attached. So the email carries a name, a route, a departure date/time and Wahana's code, but **not our Gilifast booking code**. A name alone can collide (two bookings with the same name on the same departure), so matching is layered:

1. **Our code, if Wahana can echo it.** The PIC WhatsApp already carries our booking code. If the Wahana dashboard has a free-text field (note, reference, name suffix) that ends up in the email, the code in the body gives an exact match. To be asked of Wahana (open question 6).
2. **Fallback key:** operator (from the sender address) + route + exact departure time (WITA) + the greeting name compared with the booker **and every passenger** in `Booking.notes`.
3. **Ambiguous or no match:** nothing is forwarded. The `WebhookEvent` is marked `FAILED` with the reason, and an admin picks the right booking with one click (from `/admin/webhooks` or `/admin/confirmations`); the app then forwards. A name-only guess is never sent to a customer.
4. **Wahana's code** (`BK-260915-UZ1XEB`) is stored in the `operator_ticket_forwarded` audit row, so a later email that mentions it (correction, cancellation) matches exactly.

**GIL-39 setup note vs this design:**

| GIL-39 note | Decision |
|---|---|
| WhatsApp through Meta Cloud API (`WHATSAPP_ACCESS_TOKEN`, phone number id, …) | **Keep WATI.** The app already sends through WATI (`sendTemplateMessage`), which runs on the same WABA. A verified WABA and an approved template are still required. Only one new env: `PIC_ORDER_TEMPLATE`. The `WHATSAPP_*` Meta variables are not used. |
| Read the inbox by IMAP (app password) or Gmail API, polled by a Vercel cron every few minutes | **Gmail auto-forward filter → Resend inbound address** (push, no polling, no mailbox password in env). IMAP stays the fallback: it needs a new library (e.g. `imapflow`) and a cron every few minutes, while `vercel.json` only has daily crons, so it depends on the Vercel plan. Gmail API + OAuth is the third option. |
| Send the forward by SMTP with a Gmail app password | **Resend** (`src/features/messaging/email.ts`), no second sender. |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | **Not needed.** Prisma with `DATABASE_URL` already reads `Booking` and `OperatorPicContact`; a service-role key would bypass RLS. |
| Tables `trigger_tiket` / `hp_database` / `email_database` ("please confirm the names") | All three are **`OperatorPicContact`** (one row holds phone and email; already seeded on staging). Nothing new to create. |
| `CRON_SECRET` for the inbox poll | Only needed if the IMAP fallback is chosen. The existing `retry-webhooks` cron already carries it. |
| Store the Message-ID so the same email is not forwarded twice | Yes: Message-ID is `WebhookEvent.externalRef` (provider `resend-inbound`), so a redelivery is never forwarded twice. |
| Only process mail from addresses in `email_database` | Yes: the original `From` must equal an active `emailKonfirmasiTrigger`. |
| Fallback to manual review on a duplicate name | Yes, see the matching steps above. |
| `QR_HMAC_SECRET` must be set | Not needed for the forwarded Wahana PDF (their QR). Still needed for our own boarding pass: README says it exists on staging, the local value is shorter than 32 characters. |
| Set env separately for Production and Preview (staging), then redeploy | Yes. New variables: `PIC_ORDER_TEMPLATE`, `RESEND_INBOUND_SECRET`. Set them on the Vercel `staging` environment and on Production separately, then redeploy. |

## Current state of the code

| Area | Location | Notes |
|---|---|---|
| Payment settled | `src/features/tickets/ticket-issuer.ts` `recordPaymentAwaitingConfirmation` | `PENDING_PAYMENT → AWAITING_CONFIRMATION`, idempotent |
| Post-payment fan-out | `src/features/booking/notifications.ts` `notifyPaymentReceived` | Called once on the first transition from DOKU/PayPal webhooks (`webhook-processor.ts`), PayPal capture (`psp.ts`) and mock checkout; already calls `alertAdminBookingPaid` |
| WhatsApp | `src/features/messaging/whatsapp.ts` | `sendTemplateMessage` (WATI template), `normalizeWhatsappNumber`, mock fallback |
| Staff alert pattern | `src/features/messaging/admin-alerts.ts` | Template-based, swallows errors |
| PIC contacts | `prisma/schema.prisma` `OperatorPicContact`, `scripts/seed-pic-contacts.ts` | Seeded on staging; not read by any app code yet |
| Passengers | `Booking.notes` JSON `passengers: [{ name, idNumber, type }]` | No gender, no per-passenger nationality |
| Email | `src/features/messaging/email.ts` (Resend) | Outbound only; nothing reads mail today |
| Webhook log | `src/features/payments/webhook-events.ts`, `/admin/webhooks` | Dedupe, rejected-callback log, Retry |

## Design

### Part A: PIC WhatsApp on payment

- **New module** `src/features/messaging/pic-notifications.ts`:
  - `picRecipients(operatorId)` reads `OperatorPicContact` with `deletedAt: null`, `nohpNotifikasi` not null, and `OR: [{ operatorId }, { operatorId: null }]`, then dedupes numbers through `normalizeWhatsappNumber`.
  - `formatPicOrderParams(booking)` is pure. It uses `getMainLeg` / `getReturnLeg` (`src/features/booking/helpers.ts`), `formatLocalDateTime` (`src/shared/lib/datetime.ts`) and `src/features/ports/port-info.ts`, and parses passengers from `notes` the same way `ticket-issuer.ts` does.
  - `notifyOperatorPicsOrderPaid(bookingId)` swallows its own errors and writes `AuditLog` `pic_order_notified` with the recipient count.
- **Transport:** `sendTemplateMessage`. The message is business-initiated, so a WATI session message would fail; `admin-alerts.ts` uses a template for the same reason. The template name comes from the new env `PIC_ORDER_TEMPLATE`; when it is unset, the send is skipped with a log line.
- **Passenger list:** WhatsApp template params cannot contain newlines, so the list is one param, e.g. `Anita (Adult, Argentina); Suli (Child, Argentina)`. The template text in WATI carries the line layout. Mock mode logs the full rendered message.
- **Hook:** one `void notifyOperatorPicsOrderPaid(bookingId)` inside `notifyPaymentReceived`, next to `alertAdminBookingPaid`. That call site already fires only once per booking, so there is no double send.

### Part B: read the operator's ticket email and forward it to the customer

**Transport (proposed, not yet confirmed; see open question 1):**
- A Gmail filter on admin@gilifast.com auto-forwards mail from the operator's `emailKonfirmasiTrigger` address to an inbound address on Resend (e.g. `tiket@in.gilifast.com`, with an MX record on a subdomain).
- Resend POSTs a signed `email.received` webhook for each email.
- This needs no Google OAuth, reuses Resend, and is push rather than polling. Vercel cron here runs daily only, which is too slow for polling.

**Route** `src/app/api/webhooks/resend-inbound/route.ts`:
- Verify the signature with `RESEND_INBOUND_SECRET` before anything else, using a constant-time compare.
- Apply the 256 KB cap (`isOversizedWebhookBody`).
- Record the event via `beginWebhookEvent` / `recordRejectedCallback`: provider `resend-inbound`, `externalRef` = email id. That gives redelivery dedupe, the `/admin/webhooks` log and Retry.

**Processing** lives in `src/features/tickets/operator-ticket-email.ts`, one source for the route, the `retry-webhooks` cron and admin Retry. Register the provider in `RETRYABLE_EVENTS` and `dispatchWebhookEvent` (`src/features/payments/webhook-processor.ts`). Steps:

1. **Fetch** the full email (body and PDF attachments) from Resend's receiving API. The exact endpoint is to be checked against Resend's docs.
2. **Sender check:** the original `From` must equal an active `OperatorPicContact.emailKonfirmasiTrigger`, which also gives the `operatorId`. Anything else is `SKIPPED`, so a stranger cannot make us mail our customers.
3. **Parse** (pure functions):
   - `cleanSubject` strips `Fwd:` / `FW:`;
   - `stripForwardBlock` removes the `---------- Forwarded message ---------` header block;
   - `extractCustomerName` reads the greeting line (`Hi | Halo | Dear <name>`), keyword 1;
   - `extractDeparture` reads the date and time, keyword 2. Its patterns are built from real samples.
4. **Match** a `Booking` (see "Decision 2026-10-17" and "Revision 2026-10-17"):
   - first, the Gilifast booking code in the greeting, looked up in `Booking.bookingReference` and required to belong to the sender's operator (exact match);
   - fallback, only if no code is present: that `operatorId`; status `AWAITING_CONFIRMATION` or `CONFIRMED`; the greeting name equal, ignoring case and repeated spaces, to `customerName` **or any passenger name** in `notes`; and a leg (`leg` / `outboundLeg` / `returnLeg`) whose WITA date and time equals keyword 2, compared via `ymdInZone` / `formatLocalTime`.

   **Exactly one match** forwards. Zero or several matches → `FAILED` with the reason, nothing is sent, and the admin picks the booking with one click at `/admin/webhooks` (the app then forwards).
5. **Forward** with new `sendOperatorTicketForward` in `email.ts`:
   - to `booking.customerEmail`, reply-to admin@gilifast.com;
   - subject `${cleanSubject}_${bookingReference}`;
   - body: the cleaned original plus `Gilifast Booking code : {bookingReference}`;
   - the original PDFs re-attached;
   - mock fallback when `RESEND_API_KEY` is absent.
6. **Audit:** write `AuditLog` `operator_ticket_forwarded` (booking, email id, leg, and Wahana's own booking code from the email). The booking status is unchanged.

**Also:**
- `/admin/confirmations` shows "Operator ticket forwarded <time>" from that audit row, so the admin knows the operator has issued before confirming.
- A round trip gets one operator email per leg. Each is matched on its own leg and forwarded.

## Decisions 2026-10-18 (user, Part B)

- **Transport:** Gmail filter on admin@gilifast.com (`from:no-reply@virendrafastferry.com`) forwards to a Resend inbound address (e.g. `tiket@in.gilifast.com`); Resend POSTs `email.received` to `/api/webhooks/resend-inbound`. The user's side: the Gmail filter, the Resend inbound domain and the MX record. Claude cannot "listen" to a mailbox between sessions; the app receives the push.
- **Match key:** the Gilifast booking code typed after the customer's name (user confirmed the Wahana team will do this).
- **Recipient:** always `Booking.customerEmail` (the buyer), never a passenger. If Wahana sends several emails for one booking (one per passenger, or one per leg of a round trip), the buyer receives each one. Dedupe is by email Message-ID / Resend email id, not "once per booking" (this replaces the earlier "each (booking, leg) once" wording).
- **No code:** a name-only fallback is allowed only when exactly one candidate matches (same operator, paid, same WITA departure time, name equals the booker or any passenger). Recommended and built that way; the user has not yet answered whether name-only matches should auto-forward or always wait for an admin click (default: auto-forward, flagged "matched by name"). Zero or several candidates: nothing is sent and the email waits on the admin page.
- **Admin dashboard:** new page `/admin/eticket-delivery` (no schema change): **Waiting** (paid, PIC notified, operator email not yet forwarded), **Needs review** (unmatched inbound emails, one-click pick of the booking), **Delivered** (matched by code or name).
- **Resend API facts (docs, 2026-10-18):** the webhook carries metadata only (`data.email_id`, `from`, `to`, `subject`, `message_id`, `attachments[]`). Body and headers: `GET /emails/receiving/{id}`. Attachments: `GET /emails/receiving/{id}/attachments` (`download_url`, valid 1 hour). Webhook signature: Svix headers `svix-id`, `svix-timestamp`, `svix-signature` over the raw body.
- **Mock mode:** without `RESEND_API_KEY` the processor reads the email from `data.mock_email` in the payload, so the flow is testable offline. Production always has the key, so the branch never runs there.

## Decision 2026-10-19: IMAP, not Resend inbound

The user decided: **we do not use Resend for inbound; the app reads admin@gilifast.com over IMAP.** This supersedes the "Transport" bullets in "Part B" and in "Decisions 2026-10-18" (Gmail filter → Resend inbound address, `RESEND_INBOUND_SECRET`, MX on `in.gilifast.com`). Those sections stay as the historical record. Sending the forward still goes through `src/features/messaging/email.ts` (Resend, outbound) unless the user also says otherwise (open item 3 below).

**Variables the user supplied (names only, values live in `.env.local` / Vercel, never in a tracked file):** `INBOX_IMAP_HOST` (imap.gmail.com), `INBOX_IMAP_PORT` (993), `INBOX_IMAP_USER` (admin@gilifast.com), `INBOX_IMAP_PASSWORD` (Gmail app password), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`. None is read by the app yet.

**Login check, 2026-10-19 (read-only, local scratch script, no project file touched):** `LOGIN` to `imap.gmail.com:993` with the pasted `INBOX_IMAP_*` values returned `NO [AUTHENTICATIONFAILED] Invalid credentials`. The pasted password is the placeholder shape from the GIL-39 note (`abcd efgh ijkl mnop`), and `SMTP_PASSWORD` is literally `(app password)`. So **the mailbox has not been reached yet**. Needed from the user: a real Gmail app password for admin@gilifast.com (Google account needs 2-step verification; IMAP enabled in Gmail settings), kept out of chat and tracked files. The probe used `EXAMINE` (read-only), so nothing in the mailbox can change.

**What changes in the design**
- Replace the push route with a poller: `src/features/tickets/operator-ticket-inbox.ts` opens IMAP, searches unseen mail `FROM` the active `emailKonfirmasiTrigger` addresses, and hands each message (raw RFC 822: headers, body, PDF parts) to the existing `processOperatorTicketEmail`. `loadReceivedEmail` (Resend receiving API) is replaced by a MIME parse of the IMAP message.
- Dedupe stays on the `Message-ID` header (`WebhookEvent.externalRef` + the audit-row check). IMAP gives a real `Message-ID` and the sender straight from the server, which is better than the Gmail-forward path that might rewrite `From`. The spoofed-`From` risk is smaller here, since mail comes from the mailbox itself; SPF/DKIM results are in the `Authentication-Results` header and should be checked.
- Mark a message `\Seen` only after it is settled (forwarded, skipped, or logged as Needs review), never before, so a crash retries it.
- `/admin/webhooks` Retry, `/admin/eticket-delivery` and the one-click pick keep working on the same `WebhookEvent` rows.

> **Status note 2026-10-20:** choice 1 below ("cron route, GitHub Actions fallback on Hobby") and the Hobby assumption are outdated: see "Scheduling, 2026-10-20". Choices 2 and 3 stand (`imapflow`/`mailparser`/`nodemailer`, Gmail SMTP). The versions are now `imapflow` 2.5.8 and `mailparser` 3.10.0.

**Choices made 2026-10-19 (the user: "choose the best way, we use IMAP"; Claude's picks, change them if wrong)**
1. **Polling: a cron route, because the app runs on serverless Vercel.** (IMAP IDLE would push instead of poll, but it needs a connection that stays open, which a serverless function cannot hold; the only alternative is a separate always-on worker on the droplet. Cron is the simpler fit.) The route can be called by any scheduler. `GET /api/cron/poll-operator-inbox`, guarded by `CRON_SECRET` like the other cron routes, `runtime = 'nodejs'`. Each run connects, handles what is new, and disconnects, so no always-on worker is needed. Schedule: `*/5 * * * *` in `vercel.json` if the Vercel plan allows sub-daily crons (Hobby does not; the current crons are daily). If it does not, a GitHub Actions schedule (every 5 minutes, `curl` with the secret) calls the same route on any plan. Five minutes is fine: the PIC creates the ticket by hand, and the customer is not watching a spinner.
2. **Libraries: `imapflow` (IMAP), `mailparser` (MIME), `nodemailer` (SMTP).** `npm view` on 2026-10-19: imapflow 2.5.7, mailparser 3.9.47, nodemailer 10.1.7 (all the current releases; pin exact versions at install). Both are the standard pair, maintained by the same author, no native build. Nothing in the repo covers IMAP, so CLAUDE.md's "no new libraries" rule does not apply to this need.
3. **Sending: Gmail SMTP (`nodemailer`) from admin@gilifast.com, for all outbound email, in `email.ts` only.** Decided because the user does not use Resend and the Vercel check below shows no Resend key anywhere, so no email leaves the app today. `SMTP_HOST/PORT/USER/PASSWORD` and `EMAIL_FROM` feed one transport inside `src/features/messaging/email.ts` (still the single source of truth; mock fallback when `SMTP_*` is absent). The forward then comes from the same address that received the mail, as the ticket asks. Gmail/Workspace caps sending (about 500 mails a day on Workspace, fewer on a free Gmail), fine for this volume; revisit if bookings grow. This swap is its own step in the plan (before the poller is useful), with its own tests and changelog line; the Resend code and `RESEND_*` docs go with the Resend-inbound cleanup.
4. **Secrets:** `INBOX_IMAP_*` set per environment (Vercel `staging` and `production` separately, `.env.local` locally), never in git. Rotate the app password if it was pasted in chat.
5. **Staging first, read-only first.** A dry-run mode (`INBOX_POLL_DRY_RUN=1`, default on in staging): search and fetch, log what would be matched and forwarded, no `\Seen`, no send. Switch it off only after the user has looked at the list.

> **Status note 2026-10-20:** the "Poller rules" below and the `\\Seen`/`UNSEEN` wording in this section are **outdated**. As built, the poller searches the last 7 days (no unseen filter), never sets flags, tracks handled mail by Message-ID in `WebhookEvent`, and keeps only mail whose From is exactly one operator address. See "Checkpoint" and "Reviews of the IMAP change".

**Poller rules**
- Search `UNSEEN FROM <active emailKonfirmasiTrigger>` per run, cap the batch (e.g. 20 messages), oldest first. Messages over a size cap (PDF tickets are small) are logged as Needs review without download.
- One `WebhookEvent` per message: provider `imap-inbox`, `externalRef` = `Message-ID`; `\Seen` is set only after the event is settled.
- The IMAP connection has a connect and idle timeout well under the function limit; a failed login is a loud error on `/admin/console/alerts`, not a silent empty run.
- The `From` check uses the parsed header; `Authentication-Results` (SPF/DKIM pass) is required for a forward and otherwise goes to Needs review.

**Cleanup when the poller lands:** remove `/api/webhooks/resend-inbound`, `src/features/messaging/resend-inbound.ts`, `RESEND_INBOUND_SECRET`, the `resend-inbound` mentions in `README.md`, `STRUCTURE.md`, `.env.example`, `.claude/agents/security-auditor.md`, and `CHANGELOG.md` (dated note, not a rewrite). Until then those docs describe code that is still in the tree.

**Vercel env check, 2026-10-19 (read-only, variable names only, nothing decrypted; project `gilifast`, all environments: production, preview, and the `staging` custom environment):** there is **no** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_INBOUND_SECRET`, `WATI_*`, `PIC_ORDER_TEMPLATE`, `INBOX_IMAP_*`, `SMTP_*` or `EMAIL_FROM` in any of them. Present for the e-ticket work: `CRON_SECRET` (production and staging), `QR_HMAC_SECRET` (both), `DATABASE_URL` / `DIRECT_URL`. Consequence: on the deployed sites every email and WhatsApp is console-only today, and the IMAP/SMTP variables must be added to staging first, production later.

**Login check, 2026-10-19 (second run, with a real app password):** `LOGIN` to `imap.gmail.com:993` as admin@gilifast.com succeeded, and `EXAMINE INBOX` (read-only) reported 105 messages, UIDNEXT 107. The mailbox is reachable; nothing was read beyond those counts and nothing was changed. The app password is in `.env.local` only (gitignored, mode 600) as `INBOX_IMAP_*` and `SMTP_*`. It was pasted in chat, so it should be revoked and reissued before production. SMTP (port 465) has not been tested yet. The account is a Google Workspace one (the Gmail IMAP page says "access gilifast Mail"); IMAP has no enable toggle there and its default settings are fine for a read-and-flag poller.

**Vercel env written, 2026-10-19 (user asked for staging and production):** project `gilifast`, the nine variables `INBOX_IMAP_HOST/PORT/USER/PASSWORD`, `SMTP_HOST/PORT/USER/PASSWORD` and `EMAIL_FROM`, added to the `staging` custom environment and to `production` (passwords as type `sensitive`, so they cannot be read back). The first call created staging only and reported a false `ENV_CONFLICT` for production; a listing showed nothing existed there and a second call created all nine. Nothing in the deployed code reads them yet, and Vercel applies env changes only on the next deployment, so no running site changed. The same app password sits in both, and it was pasted in chat: rotate it before go-live (update the four password values in `.env.local`, staging and production).

## Handover 2026-10-19: what is needed from the user, and the order of work

**Needed from the user (blocking, in this order)**
1. **A Gmail app password for admin@gilifast.com.** Not the normal Gmail password, which must never go in this project or in chat. Steps: sign in to the account, turn on 2-Step Verification, create the password at myaccount.google.com/apppasswords (shown once, 16 letters), and turn IMAP on in Gmail → Settings → Forwarding and POP/IMAP. On Google Workspace the admin may need to allow app passwords. The password pasted on 2026-10-19 was the placeholder from the GIL-39 note and failed to log in.
2. **Put it in `.env.local` (gitignored), not in chat:** `INBOX_IMAP_HOST=imap.gmail.com`, `INBOX_IMAP_PORT=993`, `INBOX_IMAP_USER=admin@gilifast.com`, `INBOX_IMAP_PASSWORD`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=admin@gilifast.com`, `SMTP_PASSWORD` (the same app password), `EMAIL_FROM="Gilifast <admin@gilifast.com>"`. Then tell Claude, who reruns the read-only login probe (`EXAMINE`, nothing in the mailbox can change).
3. **The go to implement** (docs first, rule from the user's memory).
4. **The Vercel plan:** does it allow crons more often than daily? If not, the poll is scheduled by GitHub Actions calling the same route.

**Order of work once the user says go**
1. SMTP transport in `src/features/messaging/email.ts` (`nodemailer`), mock fallback kept; unit + e2e tests.
2. Review 2026-10-19 gaps 1 and 2 (release the claim on any thrown send error and time the request out; no attachment → Needs review). Patch version + changelog.
3. IMAP poller: `/api/cron/poll-operator-inbox`, `operator-ticket-inbox.ts`, `imapflow` + `mailparser`, dry-run on staging first, then live on staging, then ask before production.
4. Cleanup: remove the Resend inbound route, `resend-inbound.ts`, `RESEND_INBOUND_SECRET` and every doc mention; docs sweep (rule 7).
5. Add the IMAP/SMTP variables to the Vercel `staging` environment (ask first, name the target); production only when the user asks.

**Not blocking, still open:** a Wahana sample email carrying a real Gilifast code; whether a name-only match auto-forwards or waits for an admin click (code currently auto-forwards); tagging `v1.4.0`; the production PIC phone fix; WATI account and template approval.

## Review 2026-10-19 (Part B as committed in `9333eb0`)

Read, not re-run. Gaps in `src/features/tickets/operator-ticket-email.ts` and `sendOperatorTicketForward` (`src/features/messaging/email.ts`), independent of the transport:

1. **A thrown send loses the ticket for good.** The audit claim is written before the send and released only on `delivered: false` with a key set. The Resend `fetch` has no try/catch or timeout, so a network error throws with the claim left in place; the retry then returns `already-forwarded` and the customer never gets the ticket, with no flag. Fix: release the claim on any thrown error and time the request out.
2. **No attachment is forwarded anyway.** The PDF check is `attachments.some(not a PDF)`, which is false for an empty list. A ticket email whose PDF is missing reaches the buyer as a bare body. Fix: no attachment → Needs review.
3. **Name-only matches auto-forward** (open question below, still not answered by the user).

## Findings 2026-10-18 (environment and transport, end of day)

- **WhatsApp and email are not connected anywhere we can see.** A read-only look at the variable names of the Vercel project `gilifast` (the only project; production, preview and the staging environment) found no `WATI_*`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_WHATSAPP_NUMBER` or `ADMIN_ALERT_TEMPLATE`. The code for WATI and Resend is on `main` (old layout: `lib/whatsapp.ts`, `lib/email.ts`) and on `staging`, but with no keys every send is only logged to the console. So payment-received, boarding-pass and cancellation messages, staff alerts and confirmation emails do not go out from that project. Not checked: another host (the repo has Docker/Caddy files and the README mentions a droplet), the Resend and WATI dashboards. Quick check: `/admin/console/alerts` on each site says whether WATI credentials are present.
- **GIL-39 note vs the app.** The note's `WHATSAPP_*` variables (Meta Cloud API direct) and `INBOX_IMAP_*` / `SMTP_*` variables (Gmail IMAP + SMTP) are not read anywhere. The app sends WhatsApp through WATI (`WATI_API_KEY`, `WATI_TENANT_ID`, `WATI_API_URL`, plus `PIC_ORDER_TEMPLATE`) and email through Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_INBOUND_SECRET`). `WATI_API_KEY` is WATI's own token, not Meta's `WHATSAPP_ACCESS_TOKEN`. The note's template name `order_masuk_operator` can be used for `PIC_ORDER_TEMPLATE`. The note wants gender/age and nationality per passenger; the message sends category and nationality (no gender; the form does not collect it).
- **Recommendation, not yet decided:** keep WATI (if the WABA number is connected to a WATI account) and keep Resend (free tier is likely enough; confirm sending and inbound limits on resend.com/pricing). Moving to Meta-direct, or to SMTP/IMAP, would be a new task with its own spike: a second WhatsApp sender, or an always-on IMAP poller (Vercel cron here is daily only) and Gmail SMTP limits.
- **Customer WhatsApp messages are session messages** (payment received, boarding pass, cancellation). WhatsApp only delivers them inside 24 hours of the customer writing to the number. Worth checking with WATI before connecting the keys, because connecting them turns on all five WhatsApp features at once.

## Open questions

> **Status note 2026-10-20:** the transport questions (1, 8) are closed: IMAP polling and Gmail SMTP, no Resend. Question 5 (name collisions) is built as "nothing is sent". Still open: 3 (WATI template approval), 4 (per-passenger nationality), 6 (the PIC typing our code: the two real Wahana test mails of 16 and 18 Oct carry no Gilifast code), 9 (WATI account), and whether a name-only match should auto-forward.

**Status 2026-10-18 evening:** answered or changed by the findings above and the Part B work: 1 and 8 (inbox transport: Gmail filter to Resend inbound, decided; account, domain and MX still to do), 2 (a real Wahana sample arrived, see Part B QC; still wanted: one with a real Gilifast code), 6 and 7 (several emails per booking are each forwarded; our code in the greeting still to be confirmed by Wahana), 9 (WATI is the transport in the code; confirm the account exists). Still open: 3, 4, 5 (built as: nothing is sent when two bookings match).

1. **Inbox transport.** Is admin@gilifast.com on Google Workspace / Gmail, so it can run an auto-forward filter? Is a Resend Inbound subdomain (e.g. `in.gilifast.com`) acceptable? If not, the fallback is the Gmail API with a Pub/Sub `watch()` (OAuth refresh token, GCP topic, renewal every 7 days).
2. **Real Wahana email samples**: subject, body, date/time format, sender address. The keyword 1 / keyword 2 parser depends on them.
3. **WATI template** for `PIC_ORDER_TEMPLATE` needs approval in WATI. Staging has no WATI keys, so staging runs in mock mode (console log).
4. **Per-passenger nationality.** Today it is the booker's nationality for everyone. Collecting it per passenger means a booking-form change (stored in `notes`, no migration).
5. **Name collisions.** Two bookings for the same operator, same name and same departure: proposed behaviour is to forward nothing and flag the event for the admin (one-click pick). Confirm.
6. **Our code in the greeting (decided, pending team confirmation).** The user will confirm with the Wahana team that the PIC types our booking code after the name. Still to check on a real sample: the exact greeting format, and whether the code also prints on the PDF boarding pass (it probably does if it is typed into the name field). Is that acceptable at boarding?
7. **Several passengers.** Does Wahana send one email per booking or one per passenger, and which name is in the greeting (booker or first passenger)? This decides whether a booking gets one forward or several.
8. **Inbox.** Can admin@gilifast.com (Gmail / Google Workspace) auto-forward Wahana's mail to a Resend inbound address, and is a subdomain such as `in.gilifast.com` acceptable? If not: IMAP (new library + minute-level cron, Vercel plan permitting) or Gmail API + OAuth.
9. **WATI vs Meta.** The GIL-39 note assumes Meta Cloud API directly; this design uses WATI. Confirm WATI is the intended transport (a second WhatsApp transport is not planned).

## Checklist

**Next session (2026-10-19):** decide WATI vs Meta-direct and confirm the WATI account/number; ~~Resend account, verified `gilifast.com`, API key, inbound domain/MX and webhook secret~~ (inbound is IMAP now, see the 2026-10-19 decision; Resend is only for sending); the WATI template `order_masuk_operator`; ~~the Gmail forwarding filter~~ (not needed with IMAP); a sample email with a real Gilifast code; name-only auto-forward vs admin click; tag `v1.4.0` after the live test. Production is untouched (rule 1), including the PIC phone fix.

- [x] Spike doc (this file)
- [ ] User confirms with the Wahana team that the PIC types our booking code in the name. Real sample email received (2026-10-18); its greeting held a placeholder code (`BK-ujicobaxxx-xxx`), so a sample with a real code is still wanted
- [x] User go-ahead to implement Part A (2026-10-18); Part B: discuss first, do not implement yet
- [x] Part A: `pic-notifications.ts`, hook in `notifyPaymentReceived`, env `PIC_ORDER_TEMPLATE`
- [x] Part B: inbound route, `operator-ticket-email.ts`, `sendOperatorTicketForward`, retry wiring, env `RESEND_INBOUND_SECRET`, admin page `/admin/eticket-delivery`; [ ] "Operator ticket forwarded" badge on `/admin/confirmations` (not built: the new page already lists it)
- [x] Part A unit tests (`tests/unit/features/messaging/pic-notifications.test.ts`); [x] Part B (`operator-ticket-parse`, `operator-ticket-email`, `resend-inbound`, route)
- [x] Part A E2E `tests/e2e/eticket-pic.spec.ts` (own fixtures, cleaned up)
- [x] `code-reviewer`, `security-auditor`, `db-query-auditor` on Part B; findings below
- [x] Part B E2E `tests/e2e/eticket-operator-email.spec.ts`; [x] QC recorded below (live Resend not verified)
- [x] Docs (`docs/pic-contacts.md`, README, `STRUCTURE.md`, `.env.example`, `feature-catalog.ts`, `.claude/agents/security-auditor.md`), `CHANGELOG.md` 1.4.0, `package.json`
- [x] Part B committed (`9333eb0`, v1.4.0; Resend inbound transport, now superseded)
- [ ] Tag `v1.4.0`: wait until the transport is settled; user's go-ahead (rule 5)
- [ ] IMAP: real app password from the user; read-only login probe passes (2026-10-19: failed with the pasted placeholder)
- [x] IMAP: constraints 1-5 chosen in "Decision 2026-10-19"; [ ] user answers item 3 (outbound email) and says "implement"
- [x] Review 2026-10-19 gaps 1 and 2 fixed with unit tests; e2e spec rewritten (run pending, see Checkpoint 5d)
- [x] Resend inbound route, `resend-inbound.ts`, `RESEND_*` removed; docs swept (2026-10-20)

## Test plan

- **Unit:**
  - recipients: operator rows plus platform rows, soft-deleted rows excluded, numbers deduped;
  - params: one way, round trip, child/infant;
  - parser: against real samples;
  - code extraction from the greeting: upper/lower case, stray space or dash, Wahana's own code ignored, code of another operator's booking rejected, no code → fallback;
  - round trip: two emails with one code → each leg forwarded once;
  - matcher (fallback without a code): match by passenger name (not only the booker), one match, none, ambiguous (→ admin pick, nothing forwarded), wrong operator, WITA edge (06:00 WITA is the previous UTC day);
  - admin one-click pick forwards once and is idempotent;
  - forward: subject and body;
  - route: bad signature, oversize, unknown sender, redelivery.
- **E2E**, using year-2089 fixtures:
  - pay via the mock checkout and assert the `pic_order_notified` audit row;
  - POST a signed inbound event and check that it appears at `/admin/webhooks`;
  - a bad signature gets 401 and shows under Rejected.
- **Not covered by e2e:** the fetch-and-forward step depends on Resend's API. It is covered by unit tests, plus one live check on staging after deploy.

## QC

### Part A (2026-10-18, staging database `asymnwikxyhipoezoggp`)

- **Unit:** `pnpm test:unit` 63 files / 974 tests pass; `pnpm lint` (0 errors, 1 old warning) and `pnpm typecheck` clean.
- **E2E:** `eticket-pic.spec.ts` and the existing `customer-booking.spec.ts` pass, with DOKU, PayPal, WATI and Resend keys blanked and `PIC_ORDER_TEMPLATE=test_pic_order`. The spec creates its own schedule, leg, booking and PIC row and removes them.
- **Dev server:** `pnpm dev` with the same env; a booking driven through search, book and the mock checkout logged one template message per recipient (booking code, passenger count and list, boat, trip type, route, departure in WITA, return trip) and wrote the `pic_order_notified` audit row. The booking stayed `AWAITING_CONFIRMATION` with no tickets. Nothing was sent to a real phone (keys blank). No fixture rows were left.
- **Data finding:** the three staging `OperatorPicContact` rows stored numbers without the leading 0 (`8133…`), which WATI cannot route. Fixed on staging to `628…`; `seed-pic-contacts.ts` now normalizes. **Production rows are not fixed yet** and must be before Part A is released.
- **Not verified:** real WATI delivery (the template is not created or approved yet); a round trip through the running app (unit tests only); the production database.
- Subagent reviews (`code-reviewer`, `db-query-auditor`): see the commit; findings fixed before it.

### Part B on IMAP (2026-10-20, staging database `asymnwikxyhipoezoggp`, real mailbox admin@gilifast.com)

- **Unit:** `pnpm test:unit` 69 files / 1063 tests pass. New: `mailer`, `inbox` (authentication verdict, MIME parse, mock path), `operator-ticket-inbox` (poller: dry run, live, dedupe, read-only lock, time budget, failures), the poll route, and more cases in `operator-ticket-email` (no PDF, unauthenticated, thrown send releases the claim, dry run) and `operator-ticket-parse`. `pnpm lint` 0 errors (1 old warning), `pnpm typecheck` clean, `pnpm exec next build` compiles with `imapflow`/`mailparser`/`nodemailer` as external packages and lists the new route. (`pnpm build` was not used: it also runs `prisma migrate deploy`.)
- **Real mailbox, dry run (read-only):** `pnpm dev` with a throwaway `CRON_SECRET` (the one in `.env.local` is blank) and `INBOX_POLL_LIVE` unset. `GET /api/cron/poll-operator-inbox` logged in to Gmail, found 1 operator sender (`no-reply@virendrafastferry.com`) and 2 candidate mails in the last 7 days (UID 101 and 103, real Wahana test tickets with a PDF each), and reported them as Needs review without forwarding or writing anything. The mailbox has 105 messages; nothing in it was changed (read-only lock, no flags).
- **Bugs this run found, fixed, with tests:** (1) Wahana's own code `BK-261016-QSZPC4` matched our code pattern (six digits read as year 2610, month 16) because the separators were optional; our code now needs separators between year, month and suffix. (2) Gmail names the DKIM signing domain in `header.i=@domain`, not `header.d=`; both are read now. After the fixes the same two mails report "No booking code, and no paid booking matches …" (names typed by the PIC: `test return 2` and `ANDY TEST GF-20261018-ABCD`).
- **Finding for the Wahana team:** these two real emails carry **no Gilifast code**; the second has an old-style `GF-20261018-ABCD` after the name. Our code format is `BK-YYYY-MM-XXXXXX`. Until the PIC types that, every email will sit in Needs review and the admin forwards it with one click. The Wahana emails are HTML-only (no text part) and are sent through Resend by Wahana, signed with DKIM for `virendrafastferry.com`.
- **Not verified:** the e2e on staging (waiting for go); SMTP sending to a real address (port 465 was never exercised; mock mode and unit tests only); a live (non-dry) run; a real email carrying a real Gilifast code; the GitHub Actions workflow (needs the repo secret and variable, and only runs from the default branch); production.
- **Local env note:** `.env.local` now holds the real mailbox and SMTP password, so e2e specs refuse to run (`requireMockPayments`) unless `SMTP_PASSWORD=` and `INBOX_IMAP_PASSWORD=` are blanked on the command line, like the payment keys.

### Scheduling the poll, findings 2026-10-20 (after the v1.5.0 push)

- **The poll has never run on a deployed site.** `vercel.json` has only the three daily crons; the GitHub workflow is inactive.
- **The GitHub repository `condoriano98/gilijet` is public and its default branch is `main`** (checked through the GitHub API; the local `origin/HEAD` still points at an old branch). Two consequences: (1) a `schedule:` workflow only runs from `main`, which is production, so the workflow would only start after a `staging` → `main` release (CLAUDE.md rule 9: two warnings); (2) Actions logs of a public repo are public, which is why the workflow prints only status codes, never the response. Scheduled workflows in a public repo are also switched off after 60 days without repository activity.
- **Options to run the poll every 5 minutes without waiting for a release:** (a) set the repository's default branch to `staging` (GitHub setting, the user's call); (b) an external scheduler (for example cron-job.org) calling `GET https://gilijet.vercel.app/api/cron/poll-operator-inbox` with the header `Authorization: Bearer <staging CRON_SECRET>`; (c) a crontab on the droplet doing the same `curl`; (d) a Vercel plan that allows sub-daily crons. None of these can be created from this session (no GitHub or scheduler access); the user picks one.
- **Failed forwards** are retried by `/api/cron/retry-webhooks`, which the workflow also calls; with options (b) and (c) that second call must be scheduled the same way, or the retry waits for the daily 03:00 Vercel cron.
- **`INBOX_POLL_SINCE`** (new, uncommitted): only mail that arrived on or after that day (WITA) is looked at, judged by IMAP arrival time, never further back than 7 days. Set to `2026-10-20` on the Vercel `staging` environment on 2026-10-20 (production not set; production has none of this code live). With it, the two older Wahana test mails (16 and 18 Oct) are no longer seen.

### Scheduling, 2026-10-20 (latest; supersedes the GitHub Actions plan above)

- **The Vercel team is on Pro** (the team switcher shows "Pro"). Sub-daily crons would be allowed, **but Vercel only invokes cron jobs for production deployments** (Vercel docs, "Cron jobs quickstart"; the README says the same). Staging is a custom environment, so **no Vercel cron can run on staging.**
- **The user decided: staging only for now, nothing set up on production.** So `vercel.json` is **unchanged** (an entry would only ever fire on production, after a release to `main`), and the GitHub workflow was removed (default branch is `main`, the repo is public).
- **The staging site is behind Vercel Authentication** (an unauthenticated call to `https://gilijet.vercel.app/api/cron/poll-operator-inbox` answers 302 "Protected by Vercel Authentication"). Anything outside Vercel that calls staging needs a "Protection Bypass for Automation" secret (header `x-vercel-protection-bypass`) in addition to the `CRON_SECRET`.
- **Staging-only ways to run the poll** (the user picks): (a) call it by hand; (b) a "Check mailbox now" button on `/admin/eticket-delivery` (the admin is already past the login wall; **built, chosen by the user on 2026-10-20**); (c) an external scheduler or the droplet's crontab, with the bypass secret and the staging `CRON_SECRET`; (d) run it from the developer's machine in a loop for the test window. Chosen: (b), plus manual calls.
- **Production later (not now):** add the two entries to `vercel.json` (`poll-operator-inbox` every 5 minutes; optionally `retry-webhooks` every 30 minutes instead of daily), set `INBOX_POLL_SINCE` (and later `INBOX_POLL_LIVE=true`) on the production Vercel environment, and release `staging` → `main` with the two warnings of CLAUDE.md rule 9. Production already holds `INBOX_IMAP_*`, `SMTP_*`, `EMAIL_FROM` and `CRON_SECRET` (added 2026-10-19; nothing reads them until a release).
- **`INBOX_POLL_SINCE`** (uncommitted): only mail that arrived on or after that day (WITA) is looked at, judged by IMAP arrival time, never further back than 7 days. Set to `2026-10-20` on the Vercel `staging` environment only.

### e2e on staging (2026-10-20, staging database `asymnwikxyhipoezoggp`, user's go)

`eticket-operator-email.spec.ts` (6 tests: poll route auth, no-op without a mailbox, forward by code once, stranger skipped, no-PDF waits for the admin, unmatched waits and the admin forwards it), `eticket-pic.spec.ts` (with `PIC_ORDER_TEMPLATE=test_pic_order`) and `customer-booking.spec.ts` all pass. Run with `DOKU_*`, `PAYPAL_*`, `WATI_API_KEY`, `SMTP_PASSWORD`, `INBOX_IMAP_PASSWORD` blanked and a throwaway `CRON_SECRET` (the one in `.env.local` is blank, which makes the spec skip itself), so no real mail was sent or read. The spec drives the admin Retry button, not the global retry cron, because that cron would also re-run real FAILED events in the shared staging DB. A read-only count afterwards found none of the spec's rows (events, booking, PIC row, schedule). Bug found and fixed in the spec: a second `login()` in one test hit the already-signed-in redirect. Playwright's Chromium was missing on this machine and was installed with `pnpm exec playwright install chromium`.

### Manual test plan on staging (after the push)

1. Deploy: the Vercel `staging` environment builds from the `staging` branch. It already has the `INBOX_IMAP_*`, `SMTP_*` and `EMAIL_FROM` variables (added 2026-10-19). `CRON_SECRET` is set there; `INBOX_POLL_LIVE` is not (so the poll is a dry run).
2. Dry run: `GET /api/cron/poll-operator-inbox?detail=1` with the staging `CRON_SECRET`; expect the two Wahana test mails as Needs review.
3. Real send: add the tester's address as `emailKonfirmasiTrigger` on one staging PIC row, make a paid staging booking whose `customerEmail` is a readable address, mail admin@gilifast.com from the tester's address with `Hi <name> <booking code>,` and a PDF, set `INBOX_POLL_LIVE=true` on staging, call the route, and check the buyer's inbox (subject `…_<reference>`, "Gilifast Booking code" line, PDF). Then set it back to dry run.
4. Check `/admin/eticket-delivery` (Delivered) and `/admin/webhooks` (event PROCESSED), and that a second poll does not send again.

### Reviews of the IMAP change (2026-10-20): code-reviewer and security-auditor agents

Both read the uncommitted diff and ran nothing. **Fixed, each with a unit test:**

| Finding | Fix |
|---|---|
| A message that cannot be parsed (over 12 MB decoded, corrupt) was re-downloaded every poll and never listed for the admin | recorded as `Needs review: Could not read the message …` |
| An admin's pick (or retry) of a message that is gone from INBOX, or after a UIDVALIDITY reset, dropped the row off the Needs review list | `MessageGoneError` → stays `Needs review` with the reason; the admin action also keeps the prefix on any error |
| 20 spoofed or junk mails could fill the batch; the IMAP FROM search is a substring match | candidates are filtered to an envelope From that is exactly one operator address, before the batch is cut; newest 100 only; one ranged envelope fetch |
| Transient failures waited for the 03:00 retry cron | the workflow also calls `/api/cron/retry-webhooks` every 5 minutes |
| A run killed between claim and send reported "already forwarded" and lost the ticket | the claim is marked `sent: true` after the send; an unsent claim older than 10 minutes is dropped and the mail is sent again; a recent unsent claim means "another run is on it" |
| `sanitizeEmailHtml` was a single-pass regex (tag-reassembly bypasses) | removed; the forward is plain text (`textToHtml`) plus the PDF |
| The Actions log and the route response carried subjects and customer names | the workflow prints only status codes; the route returns counts (per-message detail only with `?detail=1` and the secret); 500 says `Poll failed`; `permissions: {}` on the workflow |
| Sender trust: DMARC pass for another domain, multi-address From | DMARC counts only when Gmail's `header.from` equals the From domain; a From with several addresses has no sender and is not authenticated |
| SMTP failure reason lost | `MailResult.error` is shown in the event (`The mail server could not send the forward: …`) |
| STARTTLS not enforced on 587; attachment names and count | `requireTLS` off 465; attachments are renamed `.pdf`, at most 5 |
| Unbounded Message-ID; time budget vs `maxDuration` | capped at 200 chars; budget 30 s (Gmail IMAP alone takes 10-20 s here), SMTP timeouts 8/8/15 s |
| Privacy page said "Email provider (Resend)" | now "Google Workspace / Gmail" |

**Known and left open (decided, say so if you want them done):**
- **Double-forward window.** `WebhookEvent` has no unique key on `(provider, eventType, externalRef)` and the audit claim is check-then-create, so two runs at the same instant (a manual call during a poll, an overrun) could both send. Closing it needs a migration (unique index) or an advisory lock, which is a schema task with its own confirmation (rule 4). The claim-sent marker above narrows the window; it does not remove it.
- **`CRON_SECRET` is compared with `!==`**, like every other cron route; switching all of them to a constant-time compare is a separate change. The same secret now also lives in GitHub Actions.
- **The sender check trusts only a topmost `Authentication-Results` written by `mx.google.com`.** If admin@ ever leaves Gmail/Workspace, every ticket will go to Needs review until `isAuthenticated` is adapted.
- **The workflow runs from the default branch only:** it does not run until it is on the default branch and the secret and variable exist; README says so.
- Not re-reviewed after the fixes: a second pass was not run; the unit tests cover each fix.

### Part B (2026-10-18, staging database `asymnwikxyhipoezoggp`)

- **Unit:** `pnpm test:unit` 67 files / 1031 tests pass; lint (0 errors, 1 old warning) and typecheck clean. The parser is also run against the real Wahana email (`tests/unit/fixtures/wahana-ticket.html`, taken from an `.eml`): sender, greeting name, no code of ours, WITA departure and the sanitised HTML are asserted.
- **E2E:** `eticket-operator-email.spec.ts` (4 tests) and `eticket-pic.spec.ts` pass with DOKU, PayPal, WATI and Resend keys blanked and a throwaway `RESEND_INBOUND_SECRET`. It signs its own webhooks, uses `data.mock_email`, and covers: bad signature → 401; code match forwarded once (a redelivery and a duplicate Message-ID are not forwarded again); a stranger is SKIPPED; an unmatched email shows under Needs review and the admin forwards it from the page. Fixtures (booking, PIC row, audit and webhook rows) were removed; a read-only count afterwards found none.
- **Dev server:** the e2e ran against `pnpm dev` (the same server) and the admin page was driven in a browser by the test. No separate manual session.
- **Review findings, fixed:** the sender is trusted from the `From` header only (a `From:` line typed in the body no longer counts); the forwarded HTML is sanitised (scripts, links, remote images, handlers dropped); attachments must be real PDFs, https-only download with a timeout and no redirects, size enforced on the bytes read; the audit row is claimed before sending (and released if the send fails), and a missing `RESEND_FROM_EMAIL` with a key set now fails instead of counting as sent; the name fallback refuses a truncated candidate list; the admin pick only claims "Needs review" `email.received` rows, is scoped to the sender's operator and reports success only when something was forwarded; the cron no longer retries "Needs review" rows; Svix check rejects an empty key and a loose timestamp; the body cap also checks bytes read; the mock-email path is refused when `NODE_ENV=production`. The duplicate check now runs per booking on the `(entityType, entityId)` index (no scan of `AuditLog`).
- **Open risk (not fixed):** Resend's signature proves the call came from Resend, not who sent the mail. Anyone who can email the inbound address with a spoofed `From` of Wahana's address and a valid booking code can make us forward their (sanitised, PDF-only) mail to that booking's buyer. Mitigations in place: sanitised HTML, PDF-only, recipient is always the booking's own email, every forward is listed on `/admin/eticket-delivery`. To close it: use an unguessable inbound address, and check SPF/DKIM from the email headers once a real Resend payload shows which field carries them. The check-then-claim dedupe still has a window of one DB round trip for two simultaneous deliveries (no unique key without a schema change).
- **Not verified:** the live Resend inbound path (domain/MX, the `GET /emails/receiving/{id}` and attachment responses, the Svix secret format against a real delivery); Gmail forwarding keeping `From` and `Message-ID`; a real Wahana email carrying a real Gilifast code; real delivery of the forward (keys blank, console only); the production database.

## Status note 2026-10-24: Gilifast-written forward and Gilifast contact in the PIC message (v1.9.0)

Outdated above: the forward's subject (`<original>_<reference>`), body (the operator's text plus "Gilifast Booking code") and the helpers `cleanSubject`, `stripForwardBlock`, `textToHtml` (removed). The forward is now written by Gilifast in English or Indonesian by the booking's nationality; see `FEATURE_ETICKET_FORWARD_TEMPLATE.md`. The PIC WhatsApp (`order_masuk_operator`) now puts `admin@gilifast.com` and `+62 813-3399-869` in the email and phone variables instead of the buyer's (`formatPicOrderParams`); the 2026-10-22 note listing "buyer name, email, phone" is outdated for the last two.

Live Part B test on staging (2026-10-24, with `INBOX_POLL_LIVE=true` set temporarily on the `staging` Vercel environment): a real Wahana ticket email was read from admin@gilifast.com and forwarded to the buyer with the old format (header line, subject suffix, PDF). The new format has not been run live yet. The staging PIC table was synced to look like production (two Wahana rows and the platform row); the temporary tester rows were removed.

From v1.10.1 the buyer-name variable of the PIC WhatsApp is `<name> <Gilifast booking code>` (e.g. `Rafath Test BK-2026-10-ABC234`); the booking code is also still its own variable. QC: unit test updated (1122 pass), typecheck clean; `eticket-pic.spec.ts` does not assert the name variable and was not re-run for this change; no real WhatsApp was sent.
