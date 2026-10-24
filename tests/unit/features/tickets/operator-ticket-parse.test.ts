import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  extractBookingCode,
  extractDepartures,
  extractGreetingName,
  extractOperatorBookingCode,
  htmlToText,
  normalizeName,
  senderAddress,
} from '@/features/tickets/operator-ticket-parse';

describe('extractBookingCode', () => {
  it('reads our code from the greeting, any case', () => {
    expect(extractBookingCode('Hi Andy BK-2026-10-ABC234,')).toBe('BK-2026-10-ABC234');
    expect(extractBookingCode('hi andy bk-2026-10-abc234')).toBe('BK-2026-10-ABC234');
  });

  it('tolerates a hand-typed stray space or missing dashes', () => {
    expect(extractBookingCode('Hi Andy BK 2026 10 ABC234')).toBe('BK-2026-10-ABC234');
    expect(extractBookingCode('Hi Andy BK-2026-10 -ABC234')).toBe('BK-2026-10-ABC234');
  });

  it("ignores the operator's own code format", () => {
    expect(extractBookingCode('Booking code BK-260915-UZ1XEB')).toBeNull();
  });

  it("never reads the operator's own code as ours, even when its letters fit our alphabet (real Wahana codes)", () => {
    // Six digits then six letters: without a required separator this became year 2610, month 16.
    expect(extractBookingCode('Booking Code BK-261016-QSZPC4')).toBeNull();
    expect(extractBookingCode('Your E-Ticket & Booking Confirmation — BK-261018-VW7GAA')).toBeNull();
  });

  it('still finds our code when the operator code sits next to it', () => {
    expect(extractBookingCode('Hi Andy BK-2026-10-ABC234,\nBooking Code BK-261016-QSZPC4')).toBe('BK-2026-10-ABC234');
  });

  it('rejects letters outside the booking alphabet (I, O, 0, 1)', () => {
    expect(extractBookingCode('BK-2026-10-ABCIO0')).toBeNull();
  });

  it('is null when there is no code', () => {
    expect(extractBookingCode('Hi test,')).toBeNull();
  });
});

describe('extractGreetingName', () => {
  it('takes the name and drops our code', () => {
    expect(extractGreetingName('Hi Andy ABCD BK-2026-10-ABC234,\nYour ticket')).toBe('Andy ABCD');
  });

  it('works without a code, and for Halo / Dear', () => {
    expect(extractGreetingName('Hi test,')).toBe('test');
    expect(extractGreetingName('Halo Budi Santoso,')).toBe('Budi Santoso');
    expect(extractGreetingName('Dear Anita')).toBe('Anita');
  });

  it('drops a mistyped code too (real Wahana sample)', () => {
    expect(extractGreetingName('Hi test nofath BK-ujicobaxxx-xxx,\nThank you')).toBe('test nofath');
  });

  it('reads the real Wahana sample: no code of ours, WITA departure found', () => {
    const text =
      'Hi test nofath BK-ujicobaxxx-xxx,\nBooking Code BK-261018-TTODAW\nPadang Bai → Gili Trawangan · 31 May 2027 13:15 · Wahana Virendra Express Cantika 09';
    expect(extractBookingCode(text)).toBeNull();
    expect(extractDepartures(text)[0].toISOString()).toBe('2027-05-31T05:15:00.000Z');
  });

  it('is null without a greeting', () => {
    expect(extractGreetingName('Your ticket is attached')).toBeNull();
  });
});

describe('extractDepartures', () => {
  it('reads the WITA date and time as a UTC instant', () => {
    const [d] = extractDepartures('Sanur → Nusa Penida · 22 Jul 2027 07:00 · Wahana Virendra Rose');
    expect(d.toISOString()).toBe('2027-07-21T23:00:00.000Z');
  });

  it('reads several, with Indonesian month names', () => {
    const ds = extractDepartures('Berangkat 5 Agu 2027 09:30 dan pulang 08 Mei 2027, 14.15');
    expect(ds.map((d) => d.toISOString())).toEqual([
      '2027-08-05T01:30:00.000Z',
      '2027-05-08T06:15:00.000Z',
    ]);
  });

  it('ignores text that is not a date', () => {
    expect(extractDepartures('Booking BK-260915-UZ1XEB, 3 pax')).toEqual([]);
  });
});

describe('extractOperatorBookingCode', () => {
  it("reads the operator's own code and ignores ours", () => {
    expect(extractOperatorBookingCode('Booking Code\nBK-261024-K5DNVL\n→ Departure')).toBe('BK-261024-K5DNVL');
    expect(extractOperatorBookingCode('bk-261024-k5dnvl')).toBe('BK-261024-K5DNVL');
    expect(extractOperatorBookingCode('Hi Andy BK-2026-10-ABC234,')).toBeNull();
    expect(extractOperatorBookingCode('no code here')).toBeNull();
  });
});

describe('helpers', () => {
  it('senderAddress handles display names and bare addresses', () => {
    expect(senderAddress('Wahana <No-Reply@VirendraFastFerry.com>')).toBe('no-reply@virendrafastferry.com');
    expect(senderAddress('a@b.co')).toBe('a@b.co');
    expect(senderAddress('nobody')).toBeNull();
  });

  it('normalizeName ignores case, punctuation and repeated spaces', () => {
    expect(normalizeName('  Andy   O\'Neil ')).toBe(normalizeName('andy o neil'));
  });

  it('htmlToText keeps line breaks and drops tags', () => {
    expect(htmlToText('<p>Hi <b>Andy</b>,</p><p>Ticket&nbsp;attached</p>')).toBe('Hi Andy,\nTicket attached');
  });
});

describe('real Wahana email (fixture from an .eml of 2026-10-18)', () => {
  const html = readFileSync(join(__dirname, '../../fixtures/wahana-ticket.html'), 'utf-8');
  const text = htmlToText(html);

  it('finds the greeting name, no code of ours, and the WITA departure', () => {
    expect(extractGreetingName(text)).toBe('test nofath');
    expect(extractBookingCode(text)).toBeNull();
    expect(extractDepartures(text).map((d) => d.toISOString())).toEqual(['2027-05-31T05:15:00.000Z']);
  });

  it('finds our code when the PIC types it properly', () => {
    expect(extractBookingCode(text.replace('BK-ujicobaxxx-xxx', 'BK-2026-10-ABC234'))).toBe('BK-2026-10-ABC234');
  });
});

describe('the real Wahana email', () => {
  it("carries the operator's code", () => {
    const html = readFileSync(join(__dirname, '../../fixtures/wahana-ticket.html'), 'utf-8');
    expect(extractOperatorBookingCode(htmlToText(html))).toBe('BK-261018-TTODAW');
  });
});
