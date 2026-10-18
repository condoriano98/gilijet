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
 * confirms at /admin/confirmations. Sent as a WATI template for the same reason
 * as admin-alerts.ts (business-initiated, the PIC never messages in).
 *
 * Swallows its own errors: a failed PIC message must never roll back the
 * payment that triggered it.
 */

const CATEGORY_LABEL = { ADULT: 'Adult', CHILD: 'Child', INFANT: 'Infant' } as const;

export type PicPassenger = { name: string; category: string };

type PicLeg = {
  departureDate: Date;
  schedule: { originPort: string; destinationPort: string };
};

export type PicOrder = {
  bookingReference: string;
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
 * WhatsApp template params cannot contain newlines, so the passenger list is a
 * single `;`-joined param; the line layout lives in the WATI template text.
 * Nationality is per booking (the form collects one), repeated for each name.
 */
export function formatPicOrderParams(order: PicOrder): Record<string, string> | null {
  const main = getMainLeg(order);
  if (!main) return null;
  const ret = getReturnLeg(order);
  const nationality = order.customerNationality?.trim() || '-';
  const passengers = parsePicPassengers(order.notes);

  return {
    booking_code: order.bookingReference,
    passenger_count: String(passengers.length),
    // WATI rejects an empty param value.
    passengers:
      passengers
        .map((p) => `${p.name || '-'} (${p.category}, ${nationality})`)
        .join('; ') || '-',
    boat: order.operator.companyName,
    trip_type: ret ? 'Round trip' : 'One way',
    route: routeLabel(main),
    departure: `${formatLocalDateTime(main.departureDate)} WITA`,
    return_trip: ret
      ? `${routeLabel(ret)}, ${formatLocalDateTime(ret.departureDate)} WITA`
      : '-',
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
    const template = env.PIC_ORDER_TEMPLATE?.trim();
    if (!template) {
      console.log('[pic-notify] PIC_ORDER_TEMPLATE not set — skipping');
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        operatorId: true,
        bookingReference: true,
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
          broadcastName: 'gilifast_pic_order_paid',
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
