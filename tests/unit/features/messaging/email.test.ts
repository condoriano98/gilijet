import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), configured: vi.fn() }));
vi.mock('@/features/messaging/mailer', () => ({
  sendMail: mocks.sendMail,
  mailConfigured: mocks.configured,
}));

import {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendPaymentReceivedEmail,
} from '@/features/messaging/email';
import { formatIDR } from '@/shared/lib/utils';

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

const paymentBase = {
  to: 'jane@example.com',
  customerName: 'Jane Doe',
  bookingReference: 'GILI-ABC123',
  route: { originPort: 'Sanur', destinationPort: 'Nusa Penida' },
  boatName: 'Wahana Express',
  departureDate: new Date('2026-12-25T00:00:00Z'),
  totalAmount: 250_000,
  lookupUrl: 'https://gilifast.com/b/GILI-ABC123',
};

describe('booking emails: promo rows', () => {
  it('payment received shows the price before the promo, the promo and the total', async () => {
    await sendPaymentReceivedEmail({ ...paymentBase, discount: { code: 'NETT150', amount: 50_000 } });
    const html = sentHtml();
    expect(html).toContain('Price before promo');
    expect(html).toContain(formatIDR(300_000));
    expect(html).toContain('Promo NETT150');
    expect(html).toContain(`-${formatIDR(50_000)}`);
    expect(html).toContain(formatIDR(250_000));
  });

  it('boarding pass email shows them too, for a one-way and a round trip', async () => {
    for (const isRoundTrip of [false, true]) {
      mocks.sendMail.mockClear();
      await sendBookingConfirmation({
        ...paymentBase,
        tickets: [],
        isRoundTrip,
        discount: { code: 'NETT150', amount: 50_000 },
      });
      const html = sentHtml();
      expect(html).toContain('Price before promo');
      expect(html).toContain('Promo NETT150');
      expect(html).toContain(`-${formatIDR(50_000)}`);
    }
  });

  it('shows no promo rows when no coupon was used', async () => {
    await sendPaymentReceivedEmail(paymentBase);
    await sendBookingConfirmation({ ...paymentBase, tickets: [] });
    for (const call of mocks.sendMail.mock.calls) {
      expect(call[0].html).not.toContain('Promo');
      expect(call[0].html).not.toContain('Price before promo');
    }
  });

  it('shows no promo rows for a zero discount', async () => {
    await sendPaymentReceivedEmail({ ...paymentBase, discount: { code: 'ZERO', amount: 0 } });
    expect(sentHtml()).not.toContain('Promo');
  });

  it('escapes the code', async () => {
    await sendPaymentReceivedEmail({ ...paymentBase, discount: { code: '<b>X</b>', amount: 1_000 } });
    expect(sentHtml()).not.toContain('<b>X</b>');
    expect(sentHtml()).toContain('&lt;b&gt;X&lt;/b&gt;');
  });
});
