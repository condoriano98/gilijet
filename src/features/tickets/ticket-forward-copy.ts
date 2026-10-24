import { formatLocalDateTime } from '@/shared/lib/datetime';
import { calculateArrivalTime } from '@/features/booking/display';
import { canonicalPortName } from '@/features/ports/port-info';
import { escapeHtml } from '@/features/tickets/operator-ticket-parse';

/**
 * The email that carries the operator's ticket PDF to the buyer. The text is
 * ours, not the operator's: Indonesian for an Indonesian contact, English for
 * everyone else (and for an empty nationality).
 */

// The Wahana Virendra check-in guide (blog). Operator-specific: every operator
// that sends tickets today is Wahana; add a per-operator guide when that changes.
export const CHECKIN_GUIDE_URL = 'https://www.gilifast.com/blog/wahana-virendra-checkin-guide';

export type ForwardLanguage = 'id' | 'en';

export type ForwardLeg = {
  departureDate: Date;
  schedule: { originPort: string; destinationPort: string; durationMinutes: number };
};

export type TicketForwardInput = {
  customerName: string;
  customerNationality: string | null;
  bookingReference: string;
  operatorName: string;
  /** The operator's own booking code, read from its email. */
  operatorBookingCode: string | null;
  /** One leg for a one-way booking, outbound then return for a round trip. */
  legs: ForwardLeg[];
  passengerNames: string[];
};

const COPY = {
  id: {
    intro: (name: string) =>
      `Halo ${name}, e-tiket fastboat Anda sudah terbit. Tiket (PDF) ada di lampiran pesan ini.`,
    operator: 'Operator',
    gilifastCode: 'Kode booking Gilifast',
    operatorCode: 'Kode booking operator',
    departure: 'Berangkat',
    arrival: 'Tiba',
    passengers: 'Penumpang',
    heading: (n: number) => `Keberangkatan ${n}`,
    outro: [
      `Mohon baca panduan check-in sebelum hari keberangkatan: ${CHECKIN_GUIDE_URL}`,
      'Butuh bantuan? Hubungi Customer Service Gilifast di WhatsApp/Telegram +628133399869.',
    ],
  },
  en: {
    intro: (name: string) =>
      `Hello ${name}, your fast boat e-ticket has been issued. Your ticket (PDF) is attached to this message.`,
    operator: 'Operator',
    gilifastCode: 'Gilifast booking code',
    operatorCode: 'Operator booking code',
    departure: 'Departure',
    arrival: 'Arrival',
    passengers: 'Passengers',
    heading: (n: number) => `Departure ${n}`,
    outro: [
      `Please read the check-in guideline before your departure date: ${CHECKIN_GUIDE_URL}`,
      'Need help? Contact Gilifast Customer Service on WhatsApp/Telegram at +628133399869.',
    ],
  },
} as const;

export function forwardLanguage(nationality: string | null): ForwardLanguage {
  const n = nationality?.trim().toLowerCase();
  return n === 'indonesia' || n === 'indonesian' ? 'id' : 'en';
}

export function ticketForwardSubject(bookingReference: string): string {
  return `Your E-Ticket & Booking Confirmation - ${bookingReference}`;
}

type Line = { kind: 'text' | 'field' | 'heading' | 'blank'; label?: string; value: string };

function buildLines(input: TicketForwardInput, lang: ForwardLanguage): Line[] {
  const c = COPY[lang];
  const name = input.customerName.trim() || '-';
  const passengers = input.passengerNames.filter(Boolean).join(', ') || name;
  const lines: Line[] = [{ kind: 'text', value: c.intro(name) }];

  const blocks = input.legs.length > 0 ? input.legs : [null];
  blocks.forEach((leg, i) => {
    lines.push({ kind: 'blank', value: '' });
    if (blocks.length > 1) lines.push({ kind: 'heading', value: c.heading(i + 1) });
    const field = (label: string, value: string): Line => ({ kind: 'field', label, value });
    lines.push(
      field(c.operator, input.operatorName || '-'),
      field(c.gilifastCode, input.bookingReference),
      field(c.operatorCode, input.operatorBookingCode || '-'),
    );
    if (leg) {
      const route = `${canonicalPortName(leg.schedule.originPort)} → ${canonicalPortName(leg.schedule.destinationPort)}`;
      const arrival = calculateArrivalTime(leg.departureDate, leg.schedule.durationMinutes);
      lines.push(
        field(c.departure, `${route}, ${formatLocalDateTime(leg.departureDate)} WITA`),
        field(c.arrival, `${formatLocalDateTime(arrival)} WITA`),
      );
    }
    lines.push(field(c.passengers, passengers));
  });

  lines.push({ kind: 'blank', value: '' }, ...c.outro.map((value): Line => ({ kind: 'text', value })));
  return lines;
}

export function renderTicketForward(input: TicketForwardInput): { subject: string; html: string; text: string } {
  const lang = forwardLanguage(input.customerNationality);
  const lines = buildLines(input, lang);

  const text = lines
    .map((l) => (l.kind === 'field' ? `${l.label}: ${l.value}` : l.value))
    .join('\n');

  const body = lines
    .map((l) => {
      if (l.kind === 'blank') return '<div style="height:12px;"></div>';
      if (l.kind === 'heading') return `<div style="font-weight:600;">${escapeHtml(l.value)}</div>`;
      if (l.kind === 'field') return `<div>${escapeHtml(l.label ?? '')}: <strong>${escapeHtml(l.value)}</strong></div>`;
      return `<div>${escapeHtml(l.value).replace(
        escapeHtml(CHECKIN_GUIDE_URL),
        `<a href="${CHECKIN_GUIDE_URL}">${CHECKIN_GUIDE_URL}</a>`,
      )}</div>`;
    })
    .join('');
  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5;">${body}</div>`;

  return { subject: ticketForwardSubject(input.bookingReference), html, text };
}
