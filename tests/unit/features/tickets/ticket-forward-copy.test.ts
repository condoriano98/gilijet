import { describe, it, expect } from 'vitest';
import {
  CHECKIN_GUIDE_URL,
  forwardLanguage,
  renderTicketForward,
  ticketForwardSubject,
  type TicketForwardInput,
} from '@/features/tickets/ticket-forward-copy';

const leg = (origin: string, dest: string, iso: string, durationMinutes = 90) => ({
  departureDate: new Date(iso),
  schedule: { originPort: origin, destinationPort: dest, durationMinutes },
});

const BASE: TicketForwardInput = {
  customerName: 'Andy Buyer',
  customerNationality: 'Indonesia',
  bookingReference: 'BK-2026-10-ABC234',
  operatorName: 'PT WAHANA VIRENDRA GROUP',
  operatorBookingCode: 'BK-261024-K5DNVL',
  legs: [leg('Sanur', 'Nusa Penida', '2027-07-21T23:00:00Z')], // 22 Jul 2027 07:00 WITA
  passengerNames: ['Andy Buyer', 'Sita Friend'],
};

describe('forwardLanguage', () => {
  it('is Indonesian only for an Indonesian contact', () => {
    expect(forwardLanguage('Indonesia')).toBe('id');
    expect(forwardLanguage(' indonesia ')).toBe('id');
    expect(forwardLanguage('Australia')).toBe('en');
    expect(forwardLanguage('')).toBe('en');
    expect(forwardLanguage(null)).toBe('en');
  });
});

describe('renderTicketForward', () => {
  it('uses one subject for both languages', () => {
    expect(ticketForwardSubject('BK-2026-10-ABC234')).toBe('Your E-Ticket & Booking Confirmation - BK-2026-10-ABC234');
    expect(renderTicketForward(BASE).subject).toBe(ticketForwardSubject('BK-2026-10-ABC234'));
    expect(renderTicketForward({ ...BASE, customerNationality: 'France' }).subject).toBe(ticketForwardSubject('BK-2026-10-ABC234'));
  });

  it('writes the Indonesian template for an Indonesian contact, times in WITA', () => {
    const { text } = renderTicketForward(BASE);
    expect(text).toBe(
      [
        'Halo Andy Buyer, e-tiket fastboat Anda sudah terbit. Tiket (PDF) ada di lampiran pesan ini.',
        '',
        'Operator: PT WAHANA VIRENDRA GROUP',
        'Kode booking Gilifast: BK-2026-10-ABC234',
        'Kode booking operator: BK-261024-K5DNVL',
        'Berangkat: Sanur → Nusa Penida, 22 Jul 2027 07:00 WITA',
        'Tiba: 22 Jul 2027 08:30 WITA',
        'Penumpang: Andy Buyer, Sita Friend',
        '',
        'Mohon baca panduan check-in sebelum hari keberangkatan: https://www.gilifast.com/blog/wahana-virendra-checkin-guide',
        'Butuh bantuan? Hubungi Customer Service Gilifast di WhatsApp/Telegram +628133399869.',
      ].join('\n'),
    );
  });

  it('writes the English template for any other nationality', () => {
    const { text } = renderTicketForward({ ...BASE, customerNationality: 'Australia' });
    expect(text).toContain('Hello Andy Buyer, your fast boat e-ticket has been issued.');
    expect(text).toContain('Gilifast booking code: BK-2026-10-ABC234');
    expect(text).toContain('Operator booking code: BK-261024-K5DNVL');
    expect(text).toContain('Departure: Sanur → Nusa Penida, 22 Jul 2027 07:00 WITA');
    expect(text).toContain('Arrival: 22 Jul 2027 08:30 WITA');
    expect(text).toContain('Passengers: Andy Buyer, Sita Friend');
    expect(text).toContain('Need help? Contact Gilifast Customer Service on WhatsApp/Telegram at +628133399869.');
    expect(text).not.toContain('Halo');
  });

  it('links the check-in guide in both languages, as a clickable link in the HTML', () => {
    for (const nationality of ['Indonesia', 'Australia']) {
      const { text, html } = renderTicketForward({ ...BASE, customerNationality: nationality });
      expect(text).toContain(`departure date: ${CHECKIN_GUIDE_URL}`.replace('departure date', nationality === 'Indonesia' ? 'hari keberangkatan' : 'departure date'));
      expect(html).toContain(`<a href="${CHECKIN_GUIDE_URL}">${CHECKIN_GUIDE_URL}</a>`);
    }
  });

  it('has no heading for a one-way booking', () => {
    expect(renderTicketForward(BASE).text).not.toMatch(/Keberangkatan \d/);
  });

  it('repeats the block under numbered headings for a round trip', () => {
    const legs = [
      leg('Padang Bai', 'Gili Trawangan', '2027-02-28T00:30:00Z'),
      leg('Gili Trawangan', 'Padang Bai', '2027-03-04T02:00:00Z', 120),
    ];
    const id = renderTicketForward({ ...BASE, legs }).text;
    expect(id).toContain('Keberangkatan 1\nOperator:');
    expect(id).toContain('Keberangkatan 2\nOperator:');
    expect(id.match(/Kode booking operator: BK-261024-K5DNVL/g)).toHaveLength(2);
    expect(id).toContain('Berangkat: Gili Trawangan → Padang Bai, 04 Mar 2027 10:00 WITA');
    expect(id).toContain('Tiba: 04 Mar 2027 12:00 WITA');
    const en = renderTicketForward({ ...BASE, customerNationality: 'Spain', legs }).text;
    expect(en).toContain('Departure 1\nOperator:');
    expect(en).toContain('Departure 2\nOperator:');
    expect(en.split('Need help?')).toHaveLength(2);
  });

  it('falls back to "-" for a missing operator code and to the buyer for missing passengers', () => {
    const { text } = renderTicketForward({ ...BASE, operatorBookingCode: null, passengerNames: [] });
    expect(text).toContain('Kode booking operator: -');
    expect(text).toContain('Penumpang: Andy Buyer');
  });

  it('escapes everything it interpolates in the HTML and keeps the operator out of it', () => {
    const { html } = renderTicketForward({ ...BASE, customerName: '<img src=x onerror=y>', passengerNames: ['<b>x</b>'] });
    expect(html).not.toMatch(/<img|<b>/);
    expect(html).toContain('&lt;img src=x onerror=y&gt;');
  });
});
