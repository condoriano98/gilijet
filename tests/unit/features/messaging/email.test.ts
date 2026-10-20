import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), configured: vi.fn() }));
vi.mock('@/features/messaging/mailer', () => ({
  sendMail: mocks.sendMail,
  mailConfigured: mocks.configured,
}));

import { sendCancellationEmail } from '@/features/messaging/email';

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

const sentHtml = () => mocks.sendMail.mock.calls[0][0].html as string;

beforeEach(() => {
  mocks.sendMail.mockReset();
  mocks.sendMail.mockResolvedValue({ delivered: true, provider: 'smtp' });
  mocks.configured.mockReturnValue(true);
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

describe('sendCancellationEmail: transport', () => {
  it('hands the message to the mailer', async () => {
    const res = await sendCancellationEmail(base);
    expect(res).toEqual({ delivered: true, provider: 'smtp' });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'jane@example.com', subject: expect.stringContaining('GILI-ABC123') }),
    );
  });

  it('only logs when mail is not configured', async () => {
    mocks.configured.mockReturnValue(false);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const res = await sendCancellationEmail(base);
    log.mockRestore();
    expect(res).toEqual({ delivered: false, provider: 'console' });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
