import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeWhatsappNumber,
  isWhatsappConfigured,
  sendBoardingPassDocument,
  sendBoardingPassWhatsapp,
  sendPaymentReceivedWhatsapp,
  sendOperatorUnavailableWhatsapp,
  sendTemplateMessage,
} from '@/lib/whatsapp';

/**
 * Unit tests for lib/whatsapp.ts
 *
 * Tests WhatsApp delivery via WATI with mock-fallback:
 * - Phone number normalization (Indonesian +62 handling)
 * - Configuration checks (WATI_API_KEY, etc)
 * - Message formatting + WATI API calls
 * - Fallback to console when WATI not configured
 *
 * Mocking: fetch API, env variables
 */

const originalEnv = { ...process.env };
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  process.env.WATI_API_KEY = 'test-wati-key';
  process.env.WATI_TENANT_ID = 'test-tenant';
  process.env.WATI_API_URL = 'https://api.wati.example.com';
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  process.env = originalEnv;
});

describe('normalizeWhatsappNumber', () => {
  it('converts 08x to 628x format', () => {
    const result = normalizeWhatsappNumber('+62 812 345 6789');
    expect(result).toBe('628123456789');
  });

  it('normalizes local 08x numbers', () => {
    const result = normalizeWhatsappNumber('0812 345 6789');
    expect(result).toBe('628123456789');
  });

  it('accepts 62x format as-is', () => {
    const result = normalizeWhatsappNumber('628123456789');
    expect(result).toBe('628123456789');
  });

  it('strips formatting characters', () => {
    const result = normalizeWhatsappNumber('+62 (812) 345-6789');
    expect(result).toBe('628123456789');
  });

  it('rejects numbers too short (< 8 digits)', () => {
    const result = normalizeWhatsappNumber('1234567');
    expect(result).toBeNull();
  });

  it('rejects empty string', () => {
    const result = normalizeWhatsappNumber('');
    expect(result).toBeNull();
  });
});

describe('isWhatsappConfigured', () => {
  it('returns true when all WATI env vars present', () => {
    expect(isWhatsappConfigured()).toBe(true);
  });

  it('returns false when WATI_API_KEY missing', () => {
    delete process.env.WATI_API_KEY;
    expect(isWhatsappConfigured()).toBe(false);
  });

  it('returns false when WATI_TENANT_ID missing', () => {
    delete process.env.WATI_TENANT_ID;
    expect(isWhatsappConfigured()).toBe(false);
  });

  it('returns false when WATI_API_URL missing', () => {
    delete process.env.WATI_API_URL;
    expect(isWhatsappConfigured()).toBe(false);
  });
});

describe('WhatsApp messaging - Mock Fallback', () => {
  it('falls back to console when WATI not configured', async () => {
    delete process.env.WATI_API_KEY;

    const result = await sendBoardingPassWhatsapp({
      to: '+62812345678',
      customerName: 'John Doe',
      bookingReference: 'GILI-ABC123',
      route: { originPort: 'BLI', destinationPort: 'SBY' },
      boatName: 'Fast Boat',
      departureDate: new Date('2026-10-25T08:00:00Z'),
      ticketCodes: ['TKT001'],
      lookupUrl: 'https://gilifast.com/b/GILI-ABC123',
    });

    expect(result.delivered).toBe(false);
    expect(result.provider).toBe('console');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns unusable number error for invalid number', async () => {
    const result = await sendBoardingPassWhatsapp({
      to: '123',
      customerName: 'John Doe',
      bookingReference: 'GILI-ABC123',
      route: { originPort: 'BLI', destinationPort: 'SBY' },
      boatName: 'Fast Boat',
      departureDate: new Date('2026-10-25T08:00:00Z'),
      ticketCodes: ['TKT001'],
      lookupUrl: 'https://gilifast.com/b/GILI-ABC123',
    });

    expect(result.delivered).toBe(false);
    expect(result.provider).toBe('console');
  });
});

describe('WhatsApp messaging - WATI API', () => {
  it('sends boarding pass text message when WATI configured', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(''),
    });

    const result = await sendBoardingPassWhatsapp({
      to: '+62812345678',
      customerName: 'John Doe',
      bookingReference: 'GILI-ABC123',
      route: { originPort: 'BLI', destinationPort: 'SBY' },
      boatName: 'Fast Boat',
      departureDate: new Date('2026-10-25T08:00:00Z'),
      ticketCodes: ['TKT001'],
      lookupUrl: 'https://gilifast.com/b/GILI-ABC123',
    });

    expect(result.delivered).toBe(true);
    expect(result.provider).toBe('wati');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('628123456789'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends payment received message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(''),
    });

    const result = await sendPaymentReceivedWhatsapp({
      to: '+62812345678',
      customerName: 'Jane Smith',
      bookingReference: 'GILI-XYZ789',
      lookupUrl: 'https://gilifast.com/b/GILI-XYZ789',
    });

    expect(result.delivered).toBe(true);
    expect(result.provider).toBe('wati');
  });

  it('sends operator unavailable message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(''),
    });

    const result = await sendOperatorUnavailableWhatsapp({
      to: '+62812345678',
      customerName: 'Bob Johnson',
      bookingReference: 'GILI-DEF456',
      lookupUrl: 'https://gilifast.com/b/GILI-DEF456',
    });

    expect(result.delivered).toBe(true);
    expect(result.provider).toBe('wati');
  });

  it('sends template message with parameters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(''),
    });

    const result = await sendTemplateMessage({
      to: '+62812345678',
      templateName: 'booking_confirmation',
      broadcastName: 'confirmations',
      params: {
        customer_name: 'John Doe',
        booking_ref: 'GILI-ABC123',
      },
    });

    expect(result.delivered).toBe(true);
    expect(result.provider).toBe('wati');
    expect(mockFetch).toHaveBeenCalled();
  });

  it('returns error on WATI API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('Unauthorized'),
    });

    const result = await sendBoardingPassWhatsapp({
      to: '+62812345678',
      customerName: 'John Doe',
      bookingReference: 'GILI-ABC123',
      route: { originPort: 'BLI', destinationPort: 'SBY' },
      boatName: 'Fast Boat',
      departureDate: new Date('2026-10-25T08:00:00Z'),
      ticketCodes: ['TKT001'],
      lookupUrl: 'https://gilifast.com/b/GILI-ABC123',
    });

    expect(result.delivered).toBe(false);
    expect(result.provider).toBe('wati');
  });
});

describe('WhatsApp document (PDF boarding pass)', () => {
  it('sends PDF document when configured', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(''),
    });

    const pdfBuffer = Buffer.from('PDF content');
    const result = await sendBoardingPassDocument({
      to: '+62812345678',
      customerName: 'John Doe',
      bookingReference: 'GILI-ABC123',
      route: { originPort: 'BLI', destinationPort: 'SBY' },
      departureDate: new Date('2026-10-25T08:00:00Z'),
      pdf: pdfBuffer,
      filename: 'boarding-pass.pdf',
    });

    expect(result.delivered).toBe(true);
    expect(result.provider).toBe('wati');
  });

  it('falls back to console when not configured', async () => {
    delete process.env.WATI_API_KEY;

    const pdfBuffer = Buffer.from('PDF content');
    const result = await sendBoardingPassDocument({
      to: '+62812345678',
      customerName: 'John Doe',
      bookingReference: 'GILI-ABC123',
      route: { originPort: 'BLI', destinationPort: 'SBY' },
      departureDate: new Date('2026-10-25T08:00:00Z'),
      pdf: pdfBuffer,
      filename: 'boarding-pass.pdf',
    });

    expect(result.delivered).toBe(false);
    expect(result.provider).toBe('console');
  });
});
