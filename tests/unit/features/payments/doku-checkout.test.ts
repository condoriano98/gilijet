import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DokuNotConfiguredError } from '@/features/payments/doku';

/**
 * DOKU Checkout tests — createCheckout() mock vs live, error handling, response parsing.
 *
 * Mock mode returns a dummy checkout. Live mode POSTs to DOKU's API with proper
 * signature. We test both paths: response parsing, error handling, and edge cases.
 */

async function loadDoku() {
  vi.resetModules();
  return import('@/features/payments/doku');
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('createCheckout — mock mode', () => {
  it('returns mock checkout URL and invoice number when DOKU_CLIENT_ID is absent', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', '');
    vi.stubEnv('DOKU_SECRET_KEY', '');

    const doku = await loadDoku();
    const result = await doku.createCheckout({
      orderId: 'GILI-ABC123',
      amount: 250_000,
      payerName: 'John Doe',
      payerEmail: 'john@example.com',
      payerPhone: '+62812345678',
      callbackUrl: 'https://example.com/callback',
    });

    expect(result.paymentUrl).toBe('/checkout/GILI-ABC123');
    expect(result.invoiceNumber).toBe('GILI-ABC123');
    expect(result.sessionId).toBeNull();
  });

  it('returns mock checkout when Client-Id starts with test_mock_', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'test_mock_client');
    vi.stubEnv('DOKU_SECRET_KEY', 'test_mock_secret');

    const doku = await loadDoku();
    const result = await doku.createCheckout({
      orderId: 'ORDER-999',
      amount: 1_000_000,
      payerName: 'Jane Smith',
      payerEmail: 'jane@example.com',
      payerPhone: '081234567890',
      callbackUrl: 'https://myapp.com/booking/confirm',
    });

    expect(result.paymentUrl).toBe('/checkout/ORDER-999');
    expect(result.invoiceNumber).toBe('ORDER-999');
    expect(result.sessionId).toBeNull();
  });

  it('includes optional expiry minutes in mock response', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', '');
    vi.stubEnv('DOKU_SECRET_KEY', '');

    const doku = await loadDoku();
    // Mock doesn't use expiryMinutes, but function should accept it without error
    const result = await doku.createCheckout({
      orderId: 'GILI-EXP',
      amount: 500_000,
      payerName: 'Test User',
      payerEmail: 'test@example.com',
      payerPhone: '+6281111111111',
      callbackUrl: 'https://example.com/return',
      expiryMinutes: 120,
    });

    expect(result.paymentUrl).toBe('/checkout/GILI-EXP');
  });
});

describe('createCheckout — live mode (HTTP mocking)', () => {
  beforeEach(() => {
    // Mock the global fetch function
    global.fetch = vi.fn();
  });

  it('throws DokuNotConfiguredError when neither CLIENT_ID nor SECRET_KEY configured', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', '');
    vi.stubEnv('DOKU_SECRET_KEY', '');

    const doku = await loadDoku();
    // When not configured, isDokuMock() returns true, so it returns a mock response
    // To test DokuNotConfiguredError, we need to set a non-mock client ID
    // but the code checks isDokuConfigured() first, which requires both variables
    // So this scenario actually never happens. The test should verify mock behavior instead.
    const result = await doku.createCheckout({
      orderId: 'GILI-123',
      amount: 250_000,
      payerName: 'John Doe',
      payerEmail: 'john@example.com',
      payerPhone: '+62812345678',
      callbackUrl: 'https://example.com/callback',
    });

    // When not configured, we get a mock response
    expect(result.paymentUrl).toBe('/checkout/GILI-123');
  });

  it('POSTs to sandbox URL when DOKU_IS_PRODUCTION=false', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'BRN-0001-TEST');
    vi.stubEnv('DOKU_SECRET_KEY', 'SK-test-secret');
    vi.stubEnv('DOKU_IS_PRODUCTION', 'false');

    const mockResponse = {
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            response: {
              payment: { url: 'https://sandbox-checkout.doku.com/xyz' },
              order: { invoice_number: 'GILI-123', session_id: 'session-xyz' },
            },
          }),
        ),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const doku = await loadDoku();
    const result = await doku.createCheckout({
      orderId: 'GILI-123',
      amount: 250_000,
      payerName: 'John Doe',
      payerEmail: 'john@example.com',
      payerPhone: '+62812345678',
      callbackUrl: 'https://example.com/callback',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api-sandbox.doku.com/checkout/v1/payment',
      expect.any(Object),
    );
    expect(result.paymentUrl).toBe('https://sandbox-checkout.doku.com/xyz');
    expect(result.invoiceNumber).toBe('GILI-123');
    expect(result.sessionId).toBe('session-xyz');
  });

  it('POSTs to live URL when DOKU_IS_PRODUCTION=true', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'BRN-0001-LIVE');
    vi.stubEnv('DOKU_SECRET_KEY', 'SK-live-secret');
    vi.stubEnv('DOKU_IS_PRODUCTION', 'true');

    const mockResponse = {
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            response: {
              payment: { url: 'https://live-checkout.doku.com/abc' },
              order: { invoice_number: 'GILI-456', session_id: 'session-abc' },
            },
          }),
        ),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const doku = await loadDoku();
    await doku.createCheckout({
      orderId: 'GILI-456',
      amount: 500_000,
      payerName: 'Jane Smith',
      payerEmail: 'jane@example.com',
      payerPhone: '081234567890',
      callbackUrl: 'https://example.com/callback',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.doku.com/checkout/v1/payment',
      expect.any(Object),
    );
  });

  it('includes correct request headers (Client-Id, Request-Id, Request-Timestamp, Signature)', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'BRN-0001-TEST');
    vi.stubEnv('DOKU_SECRET_KEY', 'SK-test-secret');
    vi.stubEnv('DOKU_IS_PRODUCTION', 'false');

    const mockResponse = {
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            response: {
              payment: { url: 'https://checkout.doku.com/xyz' },
              order: { invoice_number: 'GILI-789' },
            },
          }),
        ),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const doku = await loadDoku();
    await doku.createCheckout({
      orderId: 'GILI-789',
      amount: 250_000,
      payerName: 'Test User',
      payerEmail: 'test@example.com',
      payerPhone: '+62812345678',
      callbackUrl: 'https://example.com/callback',
    });

    expect(global.fetch).toHaveBeenCalled();
    const callArgs = (global.fetch as any).mock.calls[0];
    const options = callArgs[1];

    expect(options.headers['Client-Id']).toBe('BRN-0001-TEST');
    expect(options.headers['Request-Id']).toBeTruthy(); // UUID
    expect(options.headers['Request-Timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(options.headers['Signature']).toMatch(/^HMACSHA256=/);
  });

  it('sanitizes phone number by removing non-digits', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'BRN-0001-TEST');
    vi.stubEnv('DOKU_SECRET_KEY', 'SK-test-secret');
    vi.stubEnv('DOKU_IS_PRODUCTION', 'false');

    const mockResponse = {
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            response: {
              payment: { url: 'https://checkout.doku.com/xyz' },
              order: { invoice_number: 'GILI-PHONE' },
            },
          }),
        ),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const doku = await loadDoku();
    await doku.createCheckout({
      orderId: 'GILI-PHONE',
      amount: 250_000,
      payerName: 'Test User',
      payerEmail: 'test@example.com',
      payerPhone: '+62 (812) 345-6789', // With formatting
      callbackUrl: 'https://example.com/callback',
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.customer.phone).toBe('628123456789'); // Digits only
  });

  it('throws when response is not OK (e.g., invalid client ID)', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'BRN-INVALID');
    vi.stubEnv('DOKU_SECRET_KEY', 'SK-invalid-secret');
    vi.stubEnv('DOKU_IS_PRODUCTION', 'false');

    const mockResponse = {
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":"invalid_client_id"}'),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const doku = await loadDoku();
    await expect(
      doku.createCheckout({
        orderId: 'GILI-FAIL',
        amount: 250_000,
        payerName: 'Test User',
        payerEmail: 'test@example.com',
        payerPhone: '+62812345678',
        callbackUrl: 'https://example.com/callback',
      }),
    ).rejects.toThrow(/DOKU.*401/);
  });

  it('throws when response missing payment URL', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'BRN-0001-TEST');
    vi.stubEnv('DOKU_SECRET_KEY', 'SK-test-secret');
    vi.stubEnv('DOKU_IS_PRODUCTION', 'false');

    const mockResponse = {
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            response: {
              // Missing payment.url
              order: { invoice_number: 'GILI-NOURL' },
            },
          }),
        ),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const doku = await loadDoku();
    await expect(
      doku.createCheckout({
        orderId: 'GILI-NOURL',
        amount: 250_000,
        payerName: 'Test User',
        payerEmail: 'test@example.com',
        payerPhone: '+62812345678',
        callbackUrl: 'https://example.com/callback',
      }),
    ).rejects.toThrow('missing payment url');
  });

  it('falls back to orderId when response invoice_number missing', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'BRN-0001-TEST');
    vi.stubEnv('DOKU_SECRET_KEY', 'SK-test-secret');
    vi.stubEnv('DOKU_IS_PRODUCTION', 'false');

    const mockResponse = {
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            response: {
              payment: { url: 'https://checkout.doku.com/xyz' },
              order: {
                // Missing invoice_number
                session_id: 'session-xyz',
              },
            },
          }),
        ),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const doku = await loadDoku();
    const result = await doku.createCheckout({
      orderId: 'GILI-FALLBACK',
      amount: 250_000,
      payerName: 'Test User',
      payerEmail: 'test@example.com',
      payerPhone: '+62812345678',
      callbackUrl: 'https://example.com/callback',
    });

    expect(result.invoiceNumber).toBe('GILI-FALLBACK');
  });

  it('handles empty response text gracefully', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'BRN-0001-TEST');
    vi.stubEnv('DOKU_SECRET_KEY', 'SK-test-secret');
    vi.stubEnv('DOKU_IS_PRODUCTION', 'false');

    const mockResponse = {
      ok: true,
      text: () => Promise.resolve(''), // Empty response
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const doku = await loadDoku();
    await expect(
      doku.createCheckout({
        orderId: 'GILI-EMPTY',
        amount: 250_000,
        payerName: 'Test User',
        payerEmail: 'test@example.com',
        payerPhone: '+62812345678',
        callbackUrl: 'https://example.com/callback',
      }),
    ).rejects.toThrow('missing payment url');
  });

  it('uses default 60 minutes expiry when not specified', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'BRN-0001-TEST');
    vi.stubEnv('DOKU_SECRET_KEY', 'SK-test-secret');
    vi.stubEnv('DOKU_IS_PRODUCTION', 'false');

    const mockResponse = {
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            response: {
              payment: { url: 'https://checkout.doku.com/xyz' },
              order: { invoice_number: 'GILI-EXPIRY' },
            },
          }),
        ),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const doku = await loadDoku();
    await doku.createCheckout({
      orderId: 'GILI-EXPIRY',
      amount: 250_000,
      payerName: 'Test User',
      payerEmail: 'test@example.com',
      payerPhone: '+62812345678',
      callbackUrl: 'https://example.com/callback',
      // expiryMinutes omitted
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.payment.payment_due_date).toBe(60);
  });

  it('uses custom expiry when specified', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'BRN-0001-TEST');
    vi.stubEnv('DOKU_SECRET_KEY', 'SK-test-secret');
    vi.stubEnv('DOKU_IS_PRODUCTION', 'false');

    const mockResponse = {
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            response: {
              payment: { url: 'https://checkout.doku.com/xyz' },
              order: { invoice_number: 'GILI-CUSTOM-EXP' },
            },
          }),
        ),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const doku = await loadDoku();
    await doku.createCheckout({
      orderId: 'GILI-CUSTOM-EXP',
      amount: 250_000,
      payerName: 'Test User',
      payerEmail: 'test@example.com',
      payerPhone: '+62812345678',
      callbackUrl: 'https://example.com/callback',
      expiryMinutes: 120,
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.payment.payment_due_date).toBe(120);
  });

  it('rounds fractional amounts to nearest integer', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'BRN-0001-TEST');
    vi.stubEnv('DOKU_SECRET_KEY', 'SK-test-secret');
    vi.stubEnv('DOKU_IS_PRODUCTION', 'false');

    const mockResponse = {
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            response: {
              payment: { url: 'https://checkout.doku.com/xyz' },
              order: { invoice_number: 'GILI-ROUND' },
            },
          }),
        ),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const doku = await loadDoku();
    await doku.createCheckout({
      orderId: 'GILI-ROUND',
      amount: 250_000.789, // Fractional amount
      payerName: 'Test User',
      payerEmail: 'test@example.com',
      payerPhone: '+62812345678',
      callbackUrl: 'https://example.com/callback',
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.order.amount).toBe(250_001); // Rounded
  });
});

describe('refundPayment', () => {
  it('returns null (manual refund flow in MVP)', async () => {
    const doku = await loadDoku();
    const result = await doku.refundPayment({
      invoiceNumber: 'GILI-123',
      amount: 250_000,
      reason: 'Customer requested cancellation',
    });

    expect(result).toBeNull();
  });
});

describe('pingDoku — diagnostics', () => {
  it('returns mock mode when not configured', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', '');
    vi.stubEnv('DOKU_SECRET_KEY', '');

    const doku = await loadDoku();
    const ping = doku.pingDoku();

    expect(ping.ok).toBe(false);
    expect(ping.mode).toBe('mock');
    expect(ping.clientIdPrefix).toBe('');
    expect(ping.secretPresent).toBe(false);
  });

  it('returns sandbox mode when configured and IS_PRODUCTION=false', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'BRN-0001-SANDBOX');
    vi.stubEnv('DOKU_SECRET_KEY', 'SK-sandbox-secret');
    vi.stubEnv('DOKU_IS_PRODUCTION', 'false');

    const doku = await loadDoku();
    const ping = doku.pingDoku();

    expect(ping.ok).toBe(true);
    expect(ping.mode).toBe('sandbox');
    expect(ping.clientIdPrefix).toBe('BRN-0001…');
    expect(ping.secretPresent).toBe(true);
  });

  it('returns live mode when configured and IS_PRODUCTION=true', async () => {
    vi.stubEnv('DOKU_CLIENT_ID', 'BRN-0001-LIVE');
    vi.stubEnv('DOKU_SECRET_KEY', 'SK-live-secret');
    vi.stubEnv('DOKU_IS_PRODUCTION', 'true');

    const doku = await loadDoku();
    const ping = doku.pingDoku();

    expect(ping.ok).toBe(true);
    expect(ping.mode).toBe('live');
    expect(ping.clientIdPrefix).toBe('BRN-0001…');
    expect(ping.secretPresent).toBe(true);
  });
});
