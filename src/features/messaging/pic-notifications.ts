import { prisma } from '@/shared/server/db';
import { env } from '@/shared/server/env';
import { audit } from '@/shared/server/audit';
import { formatLocalDateTime } from '@/shared/lib/datetime';
import { getMainLeg, getReturnLeg } from '@/features/booking/helpers';
import { canonicalPortName } from '@/features/ports/port-info';
import {
  normalizeWhatsappNumber,
  sendTemplateMessage,
} from '@/features/messaging/whatsapp';

/**
 * Tells the operator's PICs (and Gilifast's own) that a fully paid order came
 * in, so they can create the ticket in the operator's dashboard.
 *
 * Information only: the booking stays AWAITING_CONFIRMATION and the admin still
 * confirms at /admin/confirmations. Sent as a template for the same reason
 * as admin-alerts.ts (business-initiated, the PIC never messages in).
 *
 * Swallows its own errors: a failed PIC message must never roll back the
 * payment that triggered it.
 */

const CATEGORY_LABEL = { ADULT: 'Dewasa', CHILD: 'Anak', INFANT: 'Bayi' } as const;

export type PicPassenger = { name: string; category: string };

type PicLeg = {
  departureDate: Date;
  schedule: { originPort: string; destinationPort: string };
};

export type PicOrder = {
  bookingReference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNationality: string | null;
  notes: string | null;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  operator: { companyName: string };
  leg?: PicLeg | null;
  outboundLeg?: PicLeg | null;
  returnLeg?: PicLeg | null;
};

export function parsePicPassengers(notes: string | null): PicPassenger[] {
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes) as {
      passengers?: Array<{ name?: string; type?: string }>;
    };
    if (!Array.isArray(parsed.passengers)) return [];
    return parsed.passengers.map((p) => ({
      name: (p.name ?? '').trim(),
      category:
        CATEGORY_LABEL[(p.type ?? 'ADULT') as keyof typeof CATEGORY_LABEL] ??
        CATEGORY_LABEL.ADULT,
    }));
  } catch {
    return [];
  }
}

function routeLabel(leg: PicLeg): string {
  return `${canonicalPortName(leg.schedule.originPort)} to ${canonicalPortName(leg.schedule.destinationPort)}`;
}

/**
 * The values of the `order_masuk_operator` template, in the order of its
 * {{1}}…{{9}} placeholders (the sender is positional, so key order matters).
 * Params cannot contain newlines, so the passenger list is a single
 * `;`-joined value. Nationality is per booking (the form collects one),
 * repeated for each name; the form has no gender, so the list gives name,
 * category and nationality.
 */
export function formatPicOrderParams(order: PicOrder): Record<string, string> | null {
  const main = getMainLeg(order);
  if (!main) return null;
  const ret = getReturnLeg(order);
  const nationality = order.customerNationality?.trim() || '-';
  const passengers = parsePicPassengers(order.notes);

  return {
    booking_code: order.bookingReference,
    boat: order.operator.companyName,
    route: ret ? `${routeLabel(main)} (pulang-pergi)` : routeLabel(main),
    departure: ret
      ? `${formatLocalDateTime(main.departureDate)} WITA; pulang ${routeLabel(ret)}, ${formatLocalDateTime(ret.departureDate)} WITA`
      : `${formatLocalDateTime(main.departureDate)} WITA`,
    customer_name: order.customerName.trim() || '-',
    customer_email: order.customerEmail.trim() || '-',
    customer_phone: order.customerPhone.trim() || '-',
    passenger_count: String(passengers.length),
    passengers:
      passengers
        .map((p, i) => `${i + 1}) ${p.name || '-'}, ${p.category}, ${nationality}`)
        .join('; ') || '-',
  };
}

/** Operator's own PICs plus the platform rows (operatorId null), numbers de-duplicated. */
export async function picRecipients(operatorId: string): Promise<string[]> {
  const rows = await prisma.operatorPicContact.findMany({
    where: {
      deletedAt: null,
      nohpNotifikasi: { not: null },
      OR: [{ operatorId }, { operatorId: null }],
    },
    select: { nohpNotifikasi: true },
  });
  const numbers = new Set<string>();
  for (const row of rows) {
    const n = row.nohpNotifikasi ? normalizeWhatsappNumber(row.nohpNotifikasi) : null;
    if (n) numbers.add(n);
  }
  return [...numbers];
}

const legSelect = {
  departureDate: true,
  schedule: {
    select: {
      originPort: true,
      destinationPort: true,
    },
  },
} as const;

export async function notifyOperatorPicsOrderPaid(bookingId: string): Promise<void> {
  try {
    const template = env.WHATSAPP_TEMPLATE_ORDER_NOTIF?.trim();
    if (!template) {
      console.log('[pic-notify] WHATSAPP_TEMPLATE_ORDER_NOTIF not set — skipping');
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        operatorId: true,
        bookingReference: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        customerNationality: true,
        notes: true,
        tripType: true,
        operator: { select: { companyName: true } },
        leg: { select: legSelect },
        outboundLeg: { select: legSelect },
        returnLeg: { select: legSelect },
      },
    });
    if (!booking) return;

    const params = formatPicOrderParams(booking);
    if (!params) return;

    const recipients = await picRecipients(booking.operatorId);
    const results = await Promise.allSettled(
      recipients.map((to) =>
        sendTemplateMessage({
          to,
          templateName: template,
          params,
        }),
      ),
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[pic-notify] send to ${recipients[i]} failed:`, r.reason);
      }
    });
    const delivered = results.filter(
      (r) => r.status === 'fulfilled' && r.value.delivered,
    ).length;

    await audit({
      entityType: 'BOOKING',
      entityId: bookingId,
      action: 'pic_order_notified',
      userRole: 'SYSTEM',
      newState: { recipients: recipients.length, delivered },
    });
  } catch (err) {
    console.error('[pic-notify] failed:', err);
  }
}
