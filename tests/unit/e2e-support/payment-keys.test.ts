import { describe, it, expect } from 'vitest';
import { livePaymentKeys } from '../../e2e/support/payment-keys';

describe('livePaymentKeys', () => {
  it('is empty when every credential is blank or missing', () => {
    expect(livePaymentKeys({})).toEqual([]);
    expect(
      livePaymentKeys({ DOKU_CLIENT_ID: '', DOKU_SECRET_KEY: '  ', PAYPAL_CLIENT_ID: '', WATI_API_KEY: '', RESEND_API_KEY: '' }),
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
        RESEND_API_KEY: 'x',
      }),
    ).toEqual(['DOKU_CLIENT_ID', 'DOKU_SECRET_KEY', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'WATI_API_KEY', 'RESEND_API_KEY']);
  });

  it('flags a lone live messaging key', () => {
    expect(livePaymentKeys({ WATI_API_KEY: 'live' })).toEqual(['WATI_API_KEY']);
  });
});
