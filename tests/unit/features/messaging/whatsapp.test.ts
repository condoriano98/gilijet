import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeWhatsappNumber,
  isWhatsappConfigured,
  sendBoardingPassDocument,
  sendBoardingPassWhatsapp,
  sendPaymentReceivedWhatsapp,
  sendOperatorUnavailableWhatsapp,
  sendTemplateMessage,
} from '@/features/messaging/whatsapp';

/**
 * Unit tests for src/features/messaging/whatsapp.ts
 *
 * Tests WhatsApp delivery via the Meta Cloud API with mock-fallback:
 * - Phone number normalization (Indonesian +62 handling)
 * - Configuration checks (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID)
 * - Message formatting + the Graph API requests (text, template, media + document)
 * - Fallback to console when WhatsApp is not configured
 *
 * Mocking: fetch API, env variables
 */

const originalEnv = { ...process.env };
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '12345';
  process.env.WHATSAPP_API_VERSION = 'v99.0';
  process.env.WHATSAPP_TEMPLATE_LANG = 'id';
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
  it('returns true when the token and phone number id are present', () => {
    expect(isWhatsappConfigured()).toBe(true);
  });

  it('returns false when WHATSAPP_ACCESS_TOKEN missing', () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    expect(isWhatsappConfigured()).toBe(false);
  });

  it('returns false when WHATSAPP_PHONE_NUMBER_ID missing', () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    expect(isWhatsappConfigured()).toBe(false);
  });
});

describe('WhatsApp messaging - Mock Fallback', () => {
  it('falls back to console when WhatsApp is not configured', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;

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

describe('WhatsApp messaging - Meta Cloud API', () => {
  it('sends a boarding pass as a text message through the Graph API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
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

    expect(result).toEqual({ delivered: true, provider: 'meta' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v99.0/12345/messages');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '62812345678',
      type: 'text',
    });
    expect(body.text.body).toContain('GILI-ABC123');
  });

  it('sends payment received message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });

    const result = await sendPaymentReceivedWhatsapp({
      to: '+62812345678',
      customerName: 'Jane Smith',
      bookingReference: 'GILI-XYZ789',
      lookupUrl: 'https://gilifast.com/b/GILI-XYZ789',
    });

    expect(result).toEqual({ delivered: true, provider: 'meta' });
  });

  it('sends operator unavailable message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });

    const result = await sendOperatorUnavailableWhatsapp({
      to: '+62812345678',
      customerName: 'Bob Johnson',
      bookingReference: 'GILI-DEF456',
      lookupUrl: 'https://gilifast.com/b/GILI-DEF456',
    });

    expect(result).toEqual({ delivered: true, provider: 'meta' });
  });

  describe('operator unavailable: cancellation reason', () => {
    const base = {
      to: '+62812345678',
      customerName: 'Bob Johnson',
      bookingReference: 'GILI-DEF456',
      lookupUrl: 'https://gilifast.com/b/GILI-DEF456',
    };
    const sentText = () => JSON.parse(mockFetch.mock.calls[0][1].body).text.body as string;

    it('tells the customer why the departure was cancelled', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await sendOperatorUnavailableWhatsapp({ ...base, reason: 'Cuaca buruk di Selat Lombok' });
      expect(sentText()).toContain('Alasan: Cuaca buruk di Selat Lombok');
    });

    it('adds no reason line when none was given', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await sendOperatorUnavailableWhatsapp(base);
      expect(sentText()).not.toContain('Alasan');
    });

    it('ignores a blank reason and caps a long one at 200 characters', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await sendOperatorUnavailableWhatsapp({ ...base, reason: '   ' });
      expect(sentText()).not.toContain('Alasan');

      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({ ok: true });
      await sendOperatorUnavailableWhatsapp({ ...base, reason: 'x'.repeat(500) });
      expect(sentText()).toContain(`Alasan: ${'x'.repeat(200)}\n`);
      expect(sentText()).not.toContain('x'.repeat(201));
    });
  });

  it('sends a template with positional body parameters and the configured language', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await sendTemplateMessage({
      to: '+62812345678',
      templateName: 'order_masuk_operator',
      params: {
        booking_code: 'BK-2026-10-ABC234',
        passengers: '1) Anita, Dewasa, Argentina;\n2) Boris,   Dewasa, Indonesia',
        empty: '  ',
      },
    });

    expect(result).toEqual({ delivered: true, provider: 'meta' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v99.0/12345/messages');
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: 'whatsapp',
      to: '62812345678',
      type: 'template',
      template: {
        name: 'order_masuk_operator',
        language: { code: 'id' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'BK-2026-10-ABC234' },
              { type: 'text', text: '1) Anita, Dewasa, Argentina; 2) Boris, Dewasa, Indonesia' },
              { type: 'text', text: '-' },
            ],
          },
        ],
      },
    });
  });

  it('does not call the API for a template when not configured', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const result = await sendTemplateMessage({
      to: '+62812345678',
      templateName: 'order_masuk_operator',
      params: { a: 'b' },
    });
    expect(result).toEqual({ delivered: false, provider: 'console' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a rejected template as not delivered', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue('(#132000) Number of parameters does not match'),
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await sendTemplateMessage({
      to: '+62812345678',
      templateName: 'order_masuk_operator',
      params: { a: 'b' },
    });
    err.mockRestore();
    expect(result).toEqual({ delivered: false, provider: 'meta' });
  });

  it('returns not delivered on an API failure', async () => {
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

    expect(result).toEqual({ delivered: false, provider: 'meta' });
  });
});

describe('WhatsApp document (PDF boarding pass)', () => {
  it('uploads the PDF as media, then sends it as a document by media id', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ id: 'media-77' }) })
      .mockResolvedValueOnce({ ok: true });

    const result = await sendBoardingPassDocument({
      to: '+62812345678',
      customerName: 'John Doe',
      bookingReference: 'GILI-ABC123',
      route: { originPort: 'BLI', destinationPort: 'SBY' },
      departureDate: new Date('2026-10-25T08:00:00Z'),
      pdf: Buffer.from('PDF content'),
      filename: 'boarding-pass.pdf',
    });

    expect(result).toEqual({ delivered: true, provider: 'meta' });
    const [uploadUrl, upload] = mockFetch.mock.calls[0];
    expect(uploadUrl).toBe('https://graph.facebook.com/v99.0/12345/media');
    expect(upload.body.get('messaging_product')).toBe('whatsapp');
    expect(upload.body.get('type')).toBe('application/pdf');
    expect(upload.headers['Content-Type']).toBeUndefined();
    const [sendUrl, send] = mockFetch.mock.calls[1];
    expect(sendUrl).toBe('https://graph.facebook.com/v99.0/12345/messages');
    const body = JSON.parse(send.body);
    expect(body).toMatchObject({
      to: '62812345678',
      type: 'document',
      document: { id: 'media-77', filename: 'boarding-pass.pdf' },
    });
    expect(body.document.caption).toContain('GILI-ABC123');
  });

  it('does not send the document when the media upload fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, text: vi.fn().mockResolvedValue('bad') });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await sendBoardingPassDocument({
      to: '+62812345678',
      customerName: 'John Doe',
      bookingReference: 'GILI-ABC123',
      route: { originPort: 'BLI', destinationPort: 'SBY' },
      departureDate: new Date('2026-10-25T08:00:00Z'),
      pdf: Buffer.from('PDF content'),
      filename: 'boarding-pass.pdf',
    });
    err.mockRestore();
    expect(result).toEqual({ delivered: false, provider: 'meta' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to console when not configured', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;

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

describe('round-trip WhatsApp text (console fallback shows the message)', () => {
  const route = { originPort: 'Sanur', destinationPort: 'Nusa Penida' };
  const back = { originPort: 'Nusa Penida', destinationPort: 'Sanur' };
  const out = new Date('2026-11-04T00:00:00Z');
  const ret = new Date('2026-11-06T08:00:00Z');

  async function printed(run: () => Promise<unknown>): Promise<string> {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await run();
      return log.mock.calls.map((c) => c.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }
  }

  it('boarding pass document: each leg says which pass it is and that there are two', async () => {
    const text = await printed(() =>
      sendBoardingPassDocument({
        to: '+62812345678',
        customerName: 'Budi',
        bookingReference: 'BK-RT',
        route: back,
        departureDate: ret,
        pdf: Buffer.from('pdf'),
        filename: 'return.pdf',
        leg: { label: 'Pulang', index: 2, total: 2 },
      }),
    );
    expect(text).toContain('boarding pass pulang Anda terlampir (2 dari 2)');
    expect(text).toContain('Nusa Penida → Sanur');
    expect(text).toContain('2 boarding pass (berangkat dan pulang)');
  });

  it('boarding pass document: one-way caption is unchanged', async () => {
    const text = await printed(() =>
      sendBoardingPassDocument({
        to: '+62812345678',
        customerName: 'Budi',
        bookingReference: 'BK-OW',
        route,
        departureDate: out,
        pdf: Buffer.from('pdf'),
        filename: 'one.pdf',
      }),
    );
    expect(text).toContain('boarding pass Anda terlampir.');
    expect(text).not.toMatch(/dari \d|pulang-pergi/);
  });

  it('text fallback lists both sailings for a round trip', async () => {
    const text = await printed(() =>
      sendBoardingPassWhatsapp({
        to: '+62812345678',
        customerName: 'Budi',
        bookingReference: 'BK-RT',
        route,
        boatName: 'Boat A',
        departureDate: out,
        ticketCodes: ['TK-1', 'TK-2'],
        lookupUrl: 'https://example.test/b/BK-RT',
        returnLeg: { route: back, boatName: 'Boat B', departureDate: ret },
      }),
    );
    expect(text).toContain('pulang-pergi');
    expect(text).toContain('Berangkat: Sanur → Nusa Penida');
    expect(text).toContain('Pulang: Nusa Penida → Sanur');
    expect(text).toContain('Boat B');
  });

  it('text fallback for one-way keeps the single-trip layout', async () => {
    const text = await printed(() =>
      sendBoardingPassWhatsapp({
        to: '+62812345678',
        customerName: 'Budi',
        bookingReference: 'BK-OW',
        route,
        boatName: 'Boat A',
        departureDate: out,
        ticketCodes: ['TK-1'],
        lookupUrl: 'https://example.test/b/BK-OW',
      }),
    );
    expect(text).toContain('Rute: Sanur → Nusa Penida');
    expect(text).not.toContain('Pulang:');
  });

  it('cancellation names both sailings of a round trip', async () => {
    const text = await printed(() =>
      sendOperatorUnavailableWhatsapp({
        to: '+62812345678',
        customerName: 'Budi',
        bookingReference: 'BK-RT',
        lookupUrl: 'https://example.test/b/BK-RT',
        trip: { outbound: { route, departureDate: out }, return: { route: back, departureDate: ret } },
      }),
    );
    expect(text).toContain('dibatalkan seluruhnya (kedua perjalanan)');
    expect(text).toContain('Berangkat: Sanur → Nusa Penida');
    expect(text).toContain('Pulang: Nusa Penida → Sanur');
    expect(text).toContain('dikembalikan penuh');
  });

  it('cancellation for one-way has no trip block', async () => {
    const text = await printed(() =>
      sendOperatorUnavailableWhatsapp({
        to: '+62812345678',
        customerName: 'Budi',
        bookingReference: 'BK-OW',
        lookupUrl: 'https://example.test/b/BK-OW',
      }),
    );
    expect(text).not.toContain('Pulang:');
    expect(text).toContain('dikembalikan penuh');
  });
});
