import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signTicketCode, buildQrPayload, verifyQrPayload } from '@/features/tickets/qr';
import { newBookingReference, newTicketCode } from '@/features/booking/references';

/**
 * Unit tests for src/features/tickets/qr.ts and src/features/booking/references.ts
 *
 * Tests QR code generation and verification:
 * - Ticket code signing with HMAC-SHA256
 * - QR payload construction (code.date.signature)
 * - QR payload verification with timing-safe comparison
 *
 * Tests booking & ticket reference generation:
 * - Unique booking reference format (BK-YYYY-MM-XXXXXX)
 * - Ticket code derivation from booking reference
 *
 * Mocking: env.QR_HMAC_SECRET for signature verification
 */

vi.mock('@/shared/server/env', () => ({
  env: {
    QR_HMAC_SECRET: 'test-secret-key-for-qr-signing',
  },
}));

describe('signTicketCode', () => {
  it('generates consistent signature for same inputs', () => {
    const sig1 = signTicketCode('TK-2026-05-ABC123-1', '2026-05-25');
    const sig2 = signTicketCode('TK-2026-05-ABC123-1', '2026-05-25');

    expect(sig1).toBe(sig2);
  });

  it('generates different signatures for different codes', () => {
    const sig1 = signTicketCode('TK-2026-05-ABC123-1', '2026-05-25');
    const sig2 = signTicketCode('TK-2026-05-ABC123-2', '2026-05-25');

    expect(sig1).not.toBe(sig2);
  });

  it('generates different signatures for different dates', () => {
    const sig1 = signTicketCode('TK-2026-05-ABC123-1', '2026-05-25');
    const sig2 = signTicketCode('TK-2026-05-ABC123-1', '2026-05-26');

    expect(sig1).not.toBe(sig2);
  });

  it('returns base64url-encoded signature (no padding)', () => {
    const sig = signTicketCode('TK-2026-05-ABC123-1', '2026-05-25');

    // Base64url should not contain +, /, or =
    expect(sig).not.toContain('+');
    expect(sig).not.toContain('/');
    expect(sig).not.toContain('=');
  });
});

describe('buildQrPayload', () => {
  it('builds payload with code, date, and signature', () => {
    const payload = buildQrPayload('TK-2026-05-ABC123-1', new Date('2026-05-25T10:00:00Z'));

    const parts = payload.split('.');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('TK-2026-05-ABC123-1');
    expect(parts[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD format
  });

  it('binds signature to departure date in WITA timezone', () => {
    // Date in UTC
    const utcDate = new Date('2026-05-25T00:00:00Z');
    const payload = buildQrPayload('TICKET-001', utcDate);

    const [, ymd] = payload.split('.');
    // WITA is UTC+8, so 2026-05-25 00:00 UTC = 2026-05-25 08:00 WITA
    expect(ymd).toMatch(/2026-05-25/);
  });
});

describe('verifyQrPayload', () => {
  it('accepts valid QR payload', () => {
    const payload = buildQrPayload('TK-2026-05-ABC123-1', new Date('2026-05-25T10:00:00Z'));
    const result = verifyQrPayload(payload);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticketCode).toBe('TK-2026-05-ABC123-1');
      expect(result.departureYmd).toMatch(/2026-05-25/);
    }
  });

  it('rejects malformed payload (missing parts)', () => {
    const result = verifyQrPayload('TK-2026-05-ABC123-1.2026-05-25'); // Missing signature

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('MALFORMED');
    }
  });

  it('rejects malformed payload (invalid date format)', () => {
    const result = verifyQrPayload('TK-2026-05-ABC123-1.25-05-2026.somesig');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('MALFORMED');
    }
  });

  it('rejects malformed payload (empty parts)', () => {
    const result = verifyQrPayload('.2026-05-25.sig');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('MALFORMED');
    }
  });

  it('rejects bad signature (tampered code)', () => {
    const payload = buildQrPayload('TK-2026-05-ABC123-1', new Date('2026-05-25T10:00:00Z'));
    const [, ymd, sig] = payload.split('.');
    const tampered = `TK-2026-05-ABC123-2.${ymd}.${sig}`; // Changed code

    const result = verifyQrPayload(tampered);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('BAD_SIGNATURE');
    }
  });

  it('rejects bad signature (tampered date)', () => {
    const payload = buildQrPayload('TK-2026-05-ABC123-1', new Date('2026-05-25T10:00:00Z'));
    const [code, , sig] = payload.split('.');
    const tampered = `${code}.2026-05-26.${sig}`; // Changed date

    const result = verifyQrPayload(tampered);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('BAD_SIGNATURE');
    }
  });

  it('rejects bad signature (invalid base64url)', () => {
    const payload = buildQrPayload('TK-2026-05-ABC123-1', new Date('2026-05-25T10:00:00Z'));
    const [code, ymd] = payload.split('.');
    const tampered = `${code}.${ymd}.!!!invalid!!!`; // Invalid base64url

    const result = verifyQrPayload(tampered);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('BAD_SIGNATURE');
    }
  });
});

describe('newBookingReference', () => {
  it('generates reference in correct format', () => {
    const ref = newBookingReference(new Date('2026-05-15T10:00:00Z'));

    expect(ref).toMatch(/^BK-\d{4}-\d{2}-[A-Z2-9]{6}$/);
  });

  it('includes correct year and month', () => {
    const ref = newBookingReference(new Date('2026-05-15T10:00:00Z'));

    expect(ref).toContain('BK-2026-05-');
  });

  it('generates different references on repeated calls', () => {
    const ref1 = newBookingReference();
    const ref2 = newBookingReference();

    expect(ref1).not.toBe(ref2);
  });

  it('uses current date when not specified', () => {
    const ref = newBookingReference();

    // Should contain current year-month
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    expect(ref).toContain(`BK-${year}-${month}-`);
  });
});

describe('newTicketCode', () => {
  it('generates ticket code from booking reference', () => {
    const bookingRef = 'BK-2026-05-ABC123';
    const ticketCode = newTicketCode(bookingRef, 1);

    expect(ticketCode).toBe('TK-2026-05-ABC123-1');
  });

  it('appends passenger index', () => {
    const bookingRef = 'BK-2026-05-ABC123';

    expect(newTicketCode(bookingRef, 1)).toContain('-1');
    expect(newTicketCode(bookingRef, 2)).toContain('-2');
    expect(newTicketCode(bookingRef, 10)).toContain('-10');
  });

  it('handles reference without BK- prefix', () => {
    const ref = '2026-05-ABC123'; // Already stripped
    const ticketCode = newTicketCode(ref, 1);

    expect(ticketCode).toBe('TK-2026-05-ABC123-1');
  });

  it('replaces BK- prefix with TK-', () => {
    const bookingRef = 'BK-2026-05-XYZABC';
    const ticketCode = newTicketCode(bookingRef, 1);

    expect(ticketCode).toMatch(/^TK-/);
    expect(ticketCode).not.toMatch(/^BK-/);
  });
});
