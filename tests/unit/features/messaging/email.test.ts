import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/server/env', () => ({
  env: { RESEND_API_KEY: 're_test', RESEND_FROM_EMAIL: 'Gilifast <no-reply@example.com>' },
}));

import { sendCancellationEmail } from '@/features/messaging/email';

const mockFetch = vi.fn();

const base = {
  to: 'jane@example.com',
  customerName: 'Jane Doe',
  bookingReference: 'GILI-ABC123',
  route: { originPort: 'Sanur', destinationPort: 'Nusa Penida' },
  departureDate: new Date('2026-12-25T00:00:00Z'),
  refundAmount: 500000,
  refundTier: 'FULL' as const,
  lookupUrl: 'https://gilifast.com/b/GILI-ABC123',
};

const sentHtml = () => JSON.parse(mockFetch.mock.calls[0][1].body).html as string;

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', mockFetch);
});

describe('sendCancellationEmail: reason', () => {
  it('shows the reason the admin gave', async () => {
    await sendCancellationEmail({ ...base, reason: 'Cuaca buruk di Selat Lombok' });
    expect(sentHtml()).toContain('Reason: Cuaca buruk di Selat Lombok');
  });

  it('omits the reason line when there is none (customer-initiated cancel)', async () => {
    await sendCancellationEmail(base);
    expect(sentHtml()).not.toContain('Reason:');
  });

  it('escapes HTML in the reason and caps its length', async () => {
    await sendCancellationEmail({ ...base, reason: '<script>alert(1)</script>' + 'y'.repeat(400) });
    const html = sentHtml();
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('y'.repeat(200));
  });
});
