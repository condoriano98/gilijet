# Feature: e-ticket issuance — PIC WhatsApp on payment, operator ticket email forwarded to the customer

**Status (2026-10-18):** Part A (PIC WhatsApp on payment) is implemented and QC'd on staging, committed without a tag. Part B (inbound operator email forward) is not started; we discuss it before building. The release (1.4.0) is tagged only after Part B. Revised 2026-10-17 after the real Wahana email and the GIL-39 setup note (see "Revision 2026-10-17").
**Created:** 2026-10-17
**Target version:** 1.4.0 (MINOR: new notification + inbound email feature). No schema change.
**Ticket:** "4 Penerbitan E-Tiket".

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

## Open questions

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

- [x] Spike doc (this file)
- [ ] User confirms with the Wahana team that the PIC types our booking code in the name; real sample email with the code received
- [x] User go-ahead to implement Part A (2026-10-18); Part B: discuss first, do not implement yet
- [x] Part A: `pic-notifications.ts`, hook in `notifyPaymentReceived`, env `PIC_ORDER_TEMPLATE`
- [ ] Part B: inbound route, `operator-ticket-email.ts`, `sendOperatorTicketForward`, retry wiring, confirmations badge, env `RESEND_INBOUND_SECRET`
- [x] Part A unit tests (`tests/unit/features/messaging/pic-notifications.test.ts`); [ ] Part B (`operator-ticket-email.test.ts`, `resend-inbound.test.ts`)
- [x] Part A E2E `tests/e2e/eticket-pic.spec.ts` (own fixtures, cleaned up)
- [ ] `security-auditor` + `db-query-auditor` (new public webhook route)
- [ ] QC via `pnpm dev`, recorded below
- [ ] Docs (`docs/pic-contacts.md`, README, `STRUCTURE.md`, `.env.example`, `feature-catalog.ts`, `.claude/agents/security-auditor.md`), `CHANGELOG.md` 1.4.0, `package.json`
- [ ] Commit / tag with confirmation (rule 5)

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

### Part B

Not started.
