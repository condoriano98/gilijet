import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderQrSvg, renderQrSvgDataUrl, renderQrPng } from '@/lib/qr-render';

/**
 * Unit tests for lib/qr-render.ts
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('renderQrSvg', () => {
  it('renders QR code as SVG string', async () => {
    const mockSvg = '<svg>...</svg>';
    vi.mocked(QRCode.toString).mockResolvedValue(mockSvg);

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
    vi.mocked(QRCode.toString).mockResolvedValue('<svg>...</svg>');

    await renderQrSvg('payload-1');
    await renderQrSvg('payload-2');

    const calls = vi.mocked(QRCode.toString).mock.calls;
    expect(calls[0][0]).toBe('payload-1');
    expect(calls[1][0]).toBe('payload-2');
  });

  it('uses error correction level M', async () => {
    vi.mocked(QRCode.toString).mockResolvedValue('<svg>...</svg>');

    await renderQrSvg('test');

    expect(vi.mocked(QRCode.toString).mock.calls[0][1].errorCorrectionLevel).toBe('M');
  });

  it('sets width to 240px for web display', async () => {
    vi.mocked(QRCode.toString).mockResolvedValue('<svg>...</svg>');

    await renderQrSvg('test');

    expect(vi.mocked(QRCode.toString).mock.calls[0][1].width).toBe(240);
  });

  it('sets margin to 1', async () => {
    vi.mocked(QRCode.toString).mockResolvedValue('<svg>...</svg>');

    await renderQrSvg('test');

    expect(vi.mocked(QRCode.toString).mock.calls[0][1].margin).toBe(1);
  });
});

describe('renderQrSvgDataUrl', () => {
  it('converts SVG to base64 data URL', async () => {
    const mockSvg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    vi.mocked(QRCode.toString).mockResolvedValue(mockSvg);

    const result = await renderQrSvgDataUrl('test-payload');

    expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(result).not.toContain('<svg'); // Should be base64 encoded
  });

  it('encodes SVG correctly to base64', async () => {
    const mockSvg = '<svg></svg>';
    vi.mocked(QRCode.toString).mockResolvedValue(mockSvg);

    const result = await renderQrSvgDataUrl('test');

    // Decode and verify
    const base64Part = result.split('base64,')[1];
    const decoded = Buffer.from(base64Part, 'base64').toString('utf8');
    expect(decoded).toBe(mockSvg);
  });

  it('uses SVG mime type', async () => {
    vi.mocked(QRCode.toString).mockResolvedValue('<svg></svg>');

    const result = await renderQrSvgDataUrl('test');

    expect(result).toContain('data:image/svg+xml;base64,');
  });
});

describe('renderQrPng', () => {
  it('renders QR code as PNG buffer', async () => {
    const mockBuffer = Buffer.from('PNG_DATA');
    vi.mocked(QRCode.toBuffer).mockResolvedValue(mockBuffer);

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
    vi.mocked(QRCode.toBuffer).mockResolvedValue(Buffer.from('PNG_DATA'));

    await renderQrPng('test');

    expect(vi.mocked(QRCode.toBuffer).mock.calls[0][1].width).toBe(600);
  });

  it('uses error correction level M', async () => {
    vi.mocked(QRCode.toBuffer).mockResolvedValue(Buffer.from('PNG_DATA'));

    await renderQrPng('test');

    expect(vi.mocked(QRCode.toBuffer).mock.calls[0][1].errorCorrectionLevel).toBe('M');
  });

  it('returns buffer that can be used for PDFs', async () => {
    const mockBuffer = Buffer.from('PNG_IMAGE_DATA');
    vi.mocked(QRCode.toBuffer).mockResolvedValue(mockBuffer);

    const result = await renderQrPng('test');

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});
