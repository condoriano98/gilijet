import { describe, it, expect } from 'vitest';
import { livePaymentKeys } from '../../e2e/support/payment-keys';

describe('livePaymentKeys', () => {
  it('is empty when every credential is blank or missing', () => {
    expect(livePaymentKeys({})).toEqual([]);
    expect(
      livePaymentKeys({ DOKU_CLIENT_ID: '', DOKU_SECRET_KEY: '  ', PAYPAL_CLIENT_ID: '', WATI_API_KEY: '', SMTP_PASSWORD: '', INBOX_IMAP_PASSWORD: '' }),
    ).toEqual([]);
  });

  it('allows the DOKU mock client id', () => {
    expect(livePaymentKeys({ DOKU_CLIENT_ID: 'test_mock_abc' })).toEqual([]);
  });

  it('flags any real credential by name', () => {
    expect(
      livePaymentKeys({
        DOKU_CLIENT_ID: 'BRN-0000',
        DOKU_SECRET_KEY: 'x',
        PAYPAL_CLIENT_ID: 'x',
        PAYPAL_CLIENT_SECRET: 'x',
        WATI_API_KEY: 'x',
        SMTP_PASSWORD: 'x',
        INBOX_IMAP_PASSWORD: 'x',
      }),
    ).toEqual(['DOKU_CLIENT_ID', 'DOKU_SECRET_KEY', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'WATI_API_KEY', 'SMTP_PASSWORD', 'INBOX_IMAP_PASSWORD']);
  });

  it('flags a lone live messaging key', () => {
    expect(livePaymentKeys({ WATI_API_KEY: 'live' })).toEqual(['WATI_API_KEY']);
  });

  it('flags a live mailbox or SMTP password, so e2e never sends or reads real mail', () => {
    expect(livePaymentKeys({ SMTP_PASSWORD: 'x' })).toEqual(['SMTP_PASSWORD']);
    expect(livePaymentKeys({ INBOX_IMAP_PASSWORD: 'x' })).toEqual(['INBOX_IMAP_PASSWORD']);
  });
});
