import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import type { QRCodeToStringOptions, QRCodeToBufferOptions } from 'qrcode';
import { renderQrSvg, renderQrSvgDataUrl, renderQrPng } from '@/features/tickets/qr-render';

/**
 * Unit tests for src/features/tickets/qr-render.ts
 *
 * Tests QR code rendering in different formats:
 * - SVG output (inline, used in web)
 * - SVG data URL (used in email)
 * - PNG buffer (used in PDF)
 *
 * Mocking: QRCode library (qrcode package)
 */

vi.mock('qrcode', () => ({
  default: {
    toString: vi.fn(),
    toBuffer: vi.fn(),
  },
}));

import QRCode from 'qrcode';

// `qrcode`'s `toString`/`toBuffer` are overloaded with a callback-style, void
// -returning variant; the library always calls the promise-style overload, so
// the mock is cast to that specific signature rather than the ambiguous one
// `vi.mocked` would otherwise infer.
const mockToString = QRCode.toString as unknown as Mock<
  (text: string, options: QRCodeToStringOptions) => Promise<string>
>;
const mockToBuffer = QRCode.toBuffer as unknown as Mock<
  (text: string, options: QRCodeToBufferOptions) => Promise<Buffer>
>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('renderQrSvg', () => {
  it('renders QR code as SVG string', async () => {
    const mockSvg = '<svg>...</svg>';
    mockToString.mockResolvedValue(mockSvg);

    const result = await renderQrSvg('test-payload');

    expect(result).toBe(mockSvg);
    expect(QRCode.toString).toHaveBeenCalledWith('test-payload', {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
    });
  });

  it('handles different payloads', async () => {
    mockToString.mockResolvedValue('<svg>...</svg>');

    await renderQrSvg('payload-1');
    await renderQrSvg('payload-2');

    const calls = mockToString.mock.calls;
    expect(calls[0][0]).toBe('payload-1');
    expect(calls[1][0]).toBe('payload-2');
  });

  it('uses error correction level M', async () => {
    mockToString.mockResolvedValue('<svg>...</svg>');

    await renderQrSvg('test');

    expect(mockToString.mock.calls[0][1].errorCorrectionLevel).toBe('M');
  });

  it('sets width to 240px for web display', async () => {
    mockToString.mockResolvedValue('<svg>...</svg>');

    await renderQrSvg('test');

    expect(mockToString.mock.calls[0][1].width).toBe(240);
  });

  it('sets margin to 1', async () => {
    mockToString.mockResolvedValue('<svg>...</svg>');

    await renderQrSvg('test');

    expect(mockToString.mock.calls[0][1].margin).toBe(1);
  });
});

describe('renderQrSvgDataUrl', () => {
  it('converts SVG to base64 data URL', async () => {
    const mockSvg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    mockToString.mockResolvedValue(mockSvg);

    const result = await renderQrSvgDataUrl('test-payload');

    expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(result).not.toContain('<svg'); // Should be base64 encoded
  });

  it('encodes SVG correctly to base64', async () => {
    const mockSvg = '<svg></svg>';
    mockToString.mockResolvedValue(mockSvg);

    const result = await renderQrSvgDataUrl('test');

    // Decode and verify
    const base64Part = result.split('base64,')[1];
    const decoded = Buffer.from(base64Part, 'base64').toString('utf8');
    expect(decoded).toBe(mockSvg);
  });

  it('uses SVG mime type', async () => {
    mockToString.mockResolvedValue('<svg></svg>');

    const result = await renderQrSvgDataUrl('test');

    expect(result).toContain('data:image/svg+xml;base64,');
  });
});

describe('renderQrPng', () => {
  it('renders QR code as PNG buffer', async () => {
    const mockBuffer = Buffer.from('PNG_DATA');
    mockToBuffer.mockResolvedValue(mockBuffer);

    const result = await renderQrPng('test-payload');

    expect(result).toBe(mockBuffer);
    expect(QRCode.toBuffer).toHaveBeenCalledWith('test-payload', {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 600,
    });
  });

  it('sets width to 600px for PDF printing', async () => {
    mockToBuffer.mockResolvedValue(Buffer.from('PNG_DATA'));

    await renderQrPng('test');

    expect(mockToBuffer.mock.calls[0][1].width).toBe(600);
  });

  it('uses error correction level M', async () => {
    mockToBuffer.mockResolvedValue(Buffer.from('PNG_DATA'));

    await renderQrPng('test');

    expect(mockToBuffer.mock.calls[0][1].errorCorrectionLevel).toBe('M');
  });

  it('returns buffer that can be used for PDFs', async () => {
    const mockBuffer = Buffer.from('PNG_IMAGE_DATA');
    mockToBuffer.mockResolvedValue(mockBuffer);

    const result = await renderQrPng('test');

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});
