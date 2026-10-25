# E-ticket forward: Gilifast-written email (EN / ID)

**Status (2026-10-24):** implemented in v1.9.0 (tag `v1.9.0`) and pushed to `staging`; the guide link came with v1.10.0. Live run of the new format still to do (see QC).
**Part of:** e-ticket Part B (`FEATURE_ETICKET_PIC_NOTIFICATION.md`).

## Problem

The forward to the customer (`sendOperatorTicketForward`, `src/features/messaging/email.ts`) passes the operator's own text through, with only "Gilifast Booking code : …" added on top. The operator's text carries the operator's branding ("Wahana Virendra · Booking Confirmed"), its own booking code next to ours, and "This is an automated email, please do not reply". We want our own email body, with the operator's PDF attached.

## Decision (from the user, 2026-10-24)

- Body is written by Gilifast from the template below, not copied from the operator.
- Language follows `Booking.customerNationality` (the nationality in the contact details of the booking form): `Indonesia` → Indonesian, every other nationality (and empty) → English.
- Subject is ours: `Your E-Ticket & Booking Confirmation - <booking code>`.

## Templates

Indonesian:

```
Halo {{1}}, e-tiket fastboat Anda sudah terbit. Tiket (PDF) ada di lampiran pesan ini.

Operator: {{2}}
Kode booking Gilifast: {{3}}
Kode booking operator: {{4}}
Berangkat: {{5}}
Tiba: {{6}}
Penumpang: {{7}}

Mohon baca panduan check-in sebelum hari keberangkatan.
Butuh bantuan? Hubungi Customer Service Gilifast di WhatsApp/Telegram +628133399869.
```

English:

```
Hello {{1}}, your fast boat e-ticket has been issued. Your ticket (PDF) is attached to this message.

Operator: {{2}}
Gilifast booking code: {{3}}
Operator booking code: {{4}}
Departure: {{5}}
Arrival: {{6}}
Passengers: {{7}}

Please read the check-in guideline before your departure date.
Need help? Contact Gilifast Customer Service on WhatsApp/Telegram at +628133399869.
```

## Where each value comes from

| Var | Source |
|---|---|
| 1 | `Booking.customerName` |
| 2 | `Operator.companyName` of the booking |
| 3 | `Booking.bookingReference` |
| 4 | Parsed from the operator's email text ("Booking Code BK-261024-K5DNVL"); new parser in `operator-ticket-parse.ts`. `-` when not found |
| 5 | Departure leg date/time in WITA (`formatLocalDateTime`), with the route (`canonicalPortName`) |
| 6 | Departure + `Schedule.durationMinutes` (`calculateArrivalTime`), WITA |
| 7 | Passenger names from `Booking.notes` (`parsePicPassengers`), joined with `, ` |

## Answers (user, 2026-10-24)

1. **Round trip:** repeat the block (Operator, Gilifast code, Operator code, Departure, Arrival, Passengers) once per leg, each under a heading: "Departure 1" / "Departure 2" (ID: "Keberangkatan 1" / "Keberangkatan 2"). A one-way booking has a single block and no heading.
2. **Operator code missing:** show `-`.
3. **Check-in guideline:** a static page will be built later; until then the template text has no link. **Done 2026-10-24:** the guide is the blog article `/blog/wahana-virendra-checkin-guide` (`FEATURE_BLOG_CHECKIN_GUIDE.md`); its URL (`CHECKIN_GUIDE_URL` in `ticket-forward-copy.ts`) is at the end of the "check-in guideline" line in both languages, a clickable link in the HTML. The URL is Wahana-specific and hardcoded to the production domain.
4. **Subject:** `Your E-Ticket & Booking Confirmation - <Gilifast booking code>`. Assumed to be the same for Indonesian and English (the user gave one subject); the operator's subject and the `_<code>` suffix are dropped.
5. **Body:** simple HTML plus a text alternative, no operator markup.

6. **Round trip is one operator email** (user, 2026-10-24): Wahana sends a single email for both legs, so there is one forward per booking and one operator code, repeated in both blocks. No per-leg matching is needed.

## Plan (after the answers)

- `src/features/tickets/operator-ticket-email.ts`: load the extra booking fields (nationality, operator name, durations, notes), build the template values; drop `stripForwardBlock(text)` as the body.
- `src/features/messaging/email.ts`: `sendOperatorTicketForward` takes the rendered body instead of `bodyHtml`.
- New pure helper for the two templates (one place for the copy and the EN/ID choice).
- Tests: unit (language by nationality, values, `-` fallbacks, round trip), e2e (forward with an Indonesian and a foreign booking).
- Docs to update: this file, `FEATURE_ETICKET_PIC_NOTIFICATION.md`, `CHANGELOG.md`, version bump (MINOR).

## Implementation (v1.9.0)

- `src/features/tickets/ticket-forward-copy.ts` (new, pure): `renderTicketForward`, `forwardLanguage`, `ticketForwardSubject`; the copy for both languages lives only here.
- `operator-ticket-parse.ts`: `extractOperatorBookingCode` added; `cleanSubject`, `stripForwardBlock`, `textToHtml` removed (nothing uses them now).
- `operator-ticket-email.ts` loads nationality, operator name and each leg's route and duration; `email.ts` `sendOperatorTicketForward` takes `{to, subject, html, text, attachments}`; `mailer.ts` `sendMail` accepts a `text` alternative.
- The `Gilifast Booking code` header line and the `_<code>` subject suffix are gone; the match, dedupe and claim logic is untouched.
- Also in this version: the PIC WhatsApp carries Gilifast's email and phone (`pic-notifications.ts`).

## QC (2026-10-24)

- **Unit:** `pnpm exec vitest run tests/unit`: 74 files / 1119 tests pass (new `ticket-forward-copy.test.ts`; `operator-ticket-email.test.ts` and `operator-ticket-parse.test.ts` updated; PIC params test updated). `pnpm typecheck` clean; `pnpm lint` 0 errors (1 old warning in `postcss.config.mjs`).
- **E2E (staging database `asymnwikxyhipoezoggp`, owner's go):** `eticket-operator-email.spec.ts` and `eticket-pic.spec.ts`, 8 of 8 pass, with the DOKU, PayPal, WhatsApp, SMTP and IMAP keys blanked (nothing was sent) and a throwaway `CRON_SECRET` (the one in `.env.local` is empty, so the operator-email spec skipped itself without it). The forward there is only logged, so the specs prove the new booking select and the forward path work against the real schema, not the wording (that is the unit test). Not run: the rest of the golden-path suite.
- **Dev server (`pnpm dev`, 2026-10-24):** started with the real IMAP and SMTP settings, WhatsApp blanked, dry run, `INBOX_POLL_SINCE=2026-10-24`. `GET /api/cron/poll-operator-inbox` answered `ok, configured: true, dryRun: true, candidates 0`: the mailbox is reachable and nothing new was waiting. A live forward with the new body still needs a new Wahana ticket email; not done yet.
- **Not run:** how the mail looks in Gmail/Outlook (user checks by hand); real SMTP delivery of the HTML + text parts.
- **Not covered:** the operator code is only read in Wahana's format (`BK-` + six digits + code), other operators show `-`.
