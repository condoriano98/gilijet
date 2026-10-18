import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  cleanSubject,
  extractBookingCode,
  extractDepartures,
  extractGreetingName,
  hasForwardBlock,
  htmlToText,
  normalizeName,
  sanitizeEmailHtml,
  senderAddress,
  stripForwardBlock,
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

describe('subject and forward block', () => {
  it('removes Fwd:/FW: once or repeatedly', () => {
    expect(cleanSubject('Fwd: E-Ticket Wahana')).toBe('E-Ticket Wahana');
    expect(cleanSubject('FW: Fwd: E-Ticket')).toBe('E-Ticket');
    expect(cleanSubject('E-Ticket')).toBe('E-Ticket');
  });

  it('strips the forwarded-message header block', () => {
    const text = [
      '---------- Forwarded message ---------',
      'From: Wahana <no-reply@virendrafastferry.com>',
      'Date: Mon, 1 Jan 2027',
      'Subject: E-Ticket',
      'To: admin@gilifast.com',
      '',
      'Hi Andy,',
    ].join('\n');
    expect(hasForwardBlock(text)).toBe(true);
    expect(stripForwardBlock(text)).toBe('Hi Andy,');
  });

  it('also handles the "------ Forwarded Message ------" form', () => {
    expect(stripForwardBlock('------ Forwarded Message ------\nFrom: a@b.co\n\nHello')).toBe('Hello');
  });

  it('leaves a plain email alone', () => {
    expect(hasForwardBlock('Hi Andy,')).toBe(false);
    expect(stripForwardBlock('Hi Andy,')).toBe('Hi Andy,');
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

describe('sanitizeEmailHtml', () => {
  it('drops scripts, links, remote images and handlers but keeps the text and layout', () => {
    const out = sanitizeEmailHtml(
      '<div onclick="x()"><script>alert(1)</script><p>Hi <a href="https://evil.test">Pay here</a></p><img src="https://evil.test/p.png"><table><tr><td>Padang Bai</td></tr></table></div>',
    );
    expect(out).not.toMatch(/script|href|<img|onclick|evil/i);
    expect(out).toContain('Pay here');
    expect(out).toContain('<td>Padang Bai</td>');
  });

  it('leaves the real Wahana email readable', () => {
    const html = readFileSync(join(__dirname, '../../fixtures/wahana-ticket.html'), 'utf-8');
    const out = sanitizeEmailHtml(html);
    expect(out).toContain('BK-261018-TTODAW');
    expect(out).toContain('Padang Bai');
  });
});
