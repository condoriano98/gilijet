import { prisma } from '@/shared/server/db';
import { sendOperatorTicketForward } from '@/features/messaging/email';
import { loadReceivedEmail, type ReceivedEmail } from '@/features/messaging/resend-inbound';
import { parsePicPassengers } from '@/features/messaging/pic-notifications';
import { env } from '@/shared/server/env';
import {
  NEEDS_REVIEW_PREFIX,
  SENDER_NOT_ALLOWED,
  type ProcessResult,
} from '@/features/payments/webhook-events';
import {
  cleanSubject,
  extractBookingCode,
  extractDepartures,
  extractGreetingName,
  hasForwardBlock,
  htmlToText,
  sanitizeEmailHtml,
  normalizeName,
  senderAddress,
  stripForwardBlock,
  textToHtml,
} from '@/features/tickets/operator-ticket-parse';

/**
 * Forward the operator's e-ticket email to the customer who bought the booking.
 *
 * The PIC creates the ticket in the operator's dashboard from our WhatsApp
 * (pic-notifications.ts) and typed our booking code after the customer's name,
 * so the email's greeting carries it. The recipient is always
 * Booking.customerEmail, never a passenger. Forwarding does not touch the
 * booking: it stays AWAITING_CONFIRMATION until an admin confirms at
 * /admin/confirmations (the payment → ticket gate is unchanged).
 *
 * Nothing is sent unless the match is certain: an exact code, or (no code at
 * all) exactly one paid booking of that operator with the same departure and a
 * matching name. Everything else FAILs with a reason for the admin page.
 */

export const OPERATOR_TICKET_PROVIDER = 'resend-inbound';
export const OPERATOR_TICKET_EVENT = 'email.received';
export const FORWARDED_ACTION = 'operator_ticket_forwarded';
export { NEEDS_REVIEW_PREFIX };

const PAID = ['AWAITING_CONFIRMATION', 'CONFIRMED'] as const;

const legSelect = { select: { departureDate: true } } as const;
const bookingSelect = {
  id: true,
  bookingReference: true,
  customerName: true,
  customerEmail: true,
  notes: true,
  tripType: true,
  operatorId: true,
  status: true,
  leg: legSelect,
  outboundLeg: legSelect,
  returnLeg: legSelect,
} as const;

type MatchedBy = 'code' | 'name' | 'admin';

const review = (reason: string): ProcessResult => ({
  ok: false,
  error: `${NEEDS_REVIEW_PREFIX}${reason}`,
});

function legsOf(b: {
  leg: { departureDate: Date } | null;
  outboundLeg: { departureDate: Date } | null;
  returnLeg: { departureDate: Date } | null;
}) {
  return [
    b.leg && { label: 'one-way', at: b.leg.departureDate },
    b.outboundLeg && { label: 'outbound', at: b.outboundLeg.departureDate },
    b.returnLeg && { label: 'return', at: b.returnLeg.departureDate },
  ].filter((x): x is { label: string; at: Date } => Boolean(x));
}

/**
 * The operators whose confirmation address is the email's From header. A
 * "From:" line inside the body is not trusted: anyone can type one.
 */
async function operatorsForSender(email: ReceivedEmail): Promise<string[]> {
  const sender = senderAddress(email.from);
  if (!sender) return [];
  const rows = await prisma.operatorPicContact.findMany({
    where: { deletedAt: null, operatorId: { not: null }, emailKonfirmasiTrigger: { not: null } },
    select: { operatorId: true, emailKonfirmasiTrigger: true },
  });
  const ids = rows
    .filter((r) => r.emailKonfirmasiTrigger!.trim().toLowerCase() === sender)
    .map((r) => r.operatorId!);
  return [...new Set(ids)];
}

export async function processOperatorTicketEmail(
  payload: Record<string, unknown>,
  opts: { forceBookingReference?: string; adminUserId?: string } = {},
): Promise<ProcessResult> {
  const email = await loadReceivedEmail(payload);
  const body = email.html && !email.text ? htmlToText(email.html) : email.text;
  const text = body || (email.html ? htmlToText(email.html) : '');

  const operatorIds = await operatorsForSender(email);
  if (operatorIds.length === 0) return { ok: true, status: SENDER_NOT_ALLOWED };

  // The ticket is a PDF. Anything else attached (or a PDF that is not one) is
  // not something we pass on under our name.
  if (email.attachments.some((a) => a.content.subarray(0, 5).toString('latin1') !== '%PDF-')) {
    return review('An attachment is not a PDF');
  }

  const departures = extractDepartures(text);
  let booking: Awaited<ReturnType<typeof findByCode>> = null;
  let matchedBy: MatchedBy = 'code';

  if (opts.forceBookingReference) {
    booking = await findByCode(opts.forceBookingReference, operatorIds);
    if (!booking) {
      return review(`Booking ${opts.forceBookingReference} is not a paid booking of this operator`);
    }
    matchedBy = 'admin';
  } else {
    const code = extractBookingCode(text);
    if (code) {
      booking = await findByCode(code, operatorIds);
      if (!booking) return review(`Code ${code} does not match a paid booking of this operator`);
    } else {
      const found = await findByName(text, departures, operatorIds);
      if (!found.ok) return review(found.reason);
      booking = found.booking;
      matchedBy = 'name';
    }
  }

  // One mail is forwarded once. The key is the Message-ID (the same mail can
  // reach us under two Resend ids), else the Resend id. Looked up per booking so
  // it uses the (entityType, entityId) index. An admin's pick is deliberate, so
  // it skips the check.
  const dedupeKey = email.messageId ?? `resend:${email.id}`;
  if (matchedBy !== 'admin') {
    const done = await prisma.auditLog.findFirst({
      where: {
        entityType: 'BOOKING',
        entityId: booking.id,
        action: FORWARDED_ACTION,
        newState: { path: ['messageId'], equals: dedupeKey },
      },
      select: { id: true },
    });
    if (done) return { ok: true, status: 'already-forwarded' };
  }

  const legs = legsOf(booking);
  const matchedLeg =
    legs.find((l) => departures.some((d) => d.getTime() === l.at.getTime()))?.label ?? null;

  const bodyHtml =
    email.html && !hasForwardBlock(text)
      ? sanitizeEmailHtml(email.html)
      : textToHtml(stripForwardBlock(text));

  // Claim before sending, and let a failed write stop the send: audit() swallows
  // errors, so relying on it would leave no record and let a retry send twice.
  const claim = await prisma.auditLog.create({
    data: {
      entityType: 'BOOKING',
      entityId: booking.id,
      action: FORWARDED_ACTION,
      userId: opts.adminUserId ?? null,
      userRole: opts.adminUserId ? 'ADMIN' : 'SYSTEM',
      newState: {
        emailId: email.id,
        messageId: dedupeKey,
        matchedBy,
        leg: matchedLeg,
        timeMatched: matchedLeg !== null || departures.length === 0,
        attachments: email.attachments.length,
        mock: !env.RESEND_API_KEY,
      },
    },
    select: { id: true },
  });

  const sent = await sendOperatorTicketForward({
    to: booking.customerEmail,
    subject: cleanSubject(email.subject),
    bodyHtml,
    bookingReference: booking.bookingReference,
    attachments: email.attachments,
  });
  // Console mode is a success only when the whole app is in mock mode (no
  // RESEND_API_KEY); with a key but no from-address nothing was sent.
  if (!sent.delivered && env.RESEND_API_KEY) {
    await prisma.auditLog.delete({ where: { id: claim.id } }).catch(() => undefined);
    return { ok: false, error: 'Resend could not send the forward' };
  }

  return { ok: true, status: 'forwarded' };
}

async function findByCode(code: string, operatorIds: string[]) {
  return prisma.booking.findFirst({
    where: { bookingReference: code, operatorId: { in: operatorIds }, status: { in: [...PAID] } },
    select: bookingSelect,
  });
}

async function findByName(
  text: string,
  departures: Date[],
  operatorIds: string[],
): Promise<
  | { ok: true; booking: NonNullable<Awaited<ReturnType<typeof findByCode>>> }
  | { ok: false; reason: string }
> {
  const name = extractGreetingName(text);
  if (!name) return { ok: false, reason: 'No booking code and no customer name in the email' };
  if (departures.length === 0) {
    return { ok: false, reason: `No booking code and no departure time found (name "${name}")` };
  }

  const candidates = await prisma.booking.findMany({
    where: {
      operatorId: { in: operatorIds },
      status: { in: [...PAID] },
      OR: [
        { leg: { departureDate: { in: departures } } },
        { outboundLeg: { departureDate: { in: departures } } },
        { returnLeg: { departureDate: { in: departures } } },
      ],
    },
    select: bookingSelect,
    take: 50,
  });

  if (candidates.length >= 50) {
    return { ok: false, reason: `No booking code, and too many bookings at that departure to match "${name}"` };
  }

  const wanted = normalizeName(name);
  const matches = candidates.filter((b) =>
    [b.customerName, ...parsePicPassengers(b.notes).map((p) => p.name)].some(
      (n) => normalizeName(n) === wanted,
    ),
  );
  if (matches.length === 1) return { ok: true, booking: matches[0] };
  return {
    ok: false,
    reason:
      matches.length === 0
        ? `No booking code, and no paid booking matches "${name}" at that departure`
        : `No booking code, and ${matches.length} bookings match "${name}" at that departure`,
  };
}
