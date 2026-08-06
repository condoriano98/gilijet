import { describe, it, expect, vi, afterEach } from "vitest";

const HEADERS = {
  transmissionId: "tx-1",
  transmissionTime: "2026-07-31T00:00:00Z",
  transmissionSig: "sig",
  certUrl: "https://api.paypal.com/v1/notifications/certs/CERT-abc",
  authAlgo: "SHA256withRSA",
};

async function loadPaypal() {
  vi.resetModules();
  return import("@/lib/paypal");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("PayPal currency support", () => {
  it("excludes IDR — the reason bookings are charged in a presentment currency", async () => {
    const { isPaypalCurrency } = await loadPaypal();
    expect(isPaypalCurrency("IDR")).toBe(false);
    expect(isPaypalCurrency("USD")).toBe(true);
    expect(isPaypalCurrency("SGD")).toBe(true);
    // Supported by our FX table for display, but not settleable by PayPal.
    expect(isPaypalCurrency("KRW")).toBe(false);
  });

  it("falls back to USD when the configured currency is one PayPal cannot settle", async () => {
    vi.stubEnv("PAYPAL_PRESENTMENT_CURRENCY", "IDR");
    const { paypalPresentmentCurrency } = await loadPaypal();
    expect(paypalPresentmentCurrency()).toBe("USD");
  });
});

describe("verifyPaypalWebhook", () => {
  it("fails closed when PAYPAL_WEBHOOK_ID is unset", async () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret");
    const { verifyPaypalWebhook } = await loadPaypal();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(
      await verifyPaypalWebhook({ headers: HEADERS, rawBody: "{}" }),
    ).toBe(false);
    // Never even reaches out — there is nothing to verify against.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed when a signature header is missing", async () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-1");
    const { verifyPaypalWebhook } = await loadPaypal();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(
      await verifyPaypalWebhook({
        headers: { ...HEADERS, transmissionSig: "" },
        rawBody: "{}",
      }),
    ).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a cert URL pointing away from paypal.com", async () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-1");
    const { verifyPaypalWebhook } = await loadPaypal();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    // cert_url arrives in an attacker-controllable header.
    for (const certUrl of [
      "https://evil.example.com/cert",
      "https://paypal.com.evil.example/cert",
      "not-a-url",
    ]) {
      expect(
        await verifyPaypalWebhook({ headers: { ...HEADERS, certUrl }, rawBody: "{}" }),
      ).toBe(false);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a body that is not valid JSON", async () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-1");
    const { verifyPaypalWebhook } = await loadPaypal();
    vi.stubGlobal("fetch", vi.fn());

    expect(
      await verifyPaypalWebhook({ headers: HEADERS, rawBody: "{oops" }),
    ).toBe(false);
  });

  it("verifies against the raw bytes and honours PayPal's verdict", async () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-1");
    const { verifyPaypalWebhook } = await loadPaypal();

    // Whitespace that JSON.stringify would normalise away — PayPal signs the
    // original serialization, so the exact bytes must be what we send back.
    const rawBody = '{\n  "event_type":  "PAYMENT.CAPTURE.COMPLETED"\n}';
    const calls: Array<{ url: string; body: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body?: string }) => {
        calls.push({ url, body: init?.body ?? "" });
        if (url.includes("/v1/oauth2/token")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({ access_token: "tok", expires_in: 32400 }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ verification_status: "SUCCESS" }),
        };
      }),
    );

    expect(await verifyPaypalWebhook({ headers: HEADERS, rawBody })).toBe(true);

    const verifyCall = calls.find((c) => c.url.includes("verify-webhook-signature"));
    const sent = JSON.parse(verifyCall!.body) as Record<string, unknown>;
    expect(sent.webhook_id).toBe("WH-1");
    expect(sent.transmission_sig).toBe("sig");
    expect(sent.webhook_event).toEqual(JSON.parse(rawBody));
  });

  it("treats a FAILURE verdict as unverified", async () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-1");
    const { verifyPaypalWebhook } = await loadPaypal();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        text: async () =>
          url.includes("/v1/oauth2/token")
            ? JSON.stringify({ access_token: "tok", expires_in: 32400 })
            : JSON.stringify({ verification_status: "FAILURE" }),
      })),
    );

    expect(
      await verifyPaypalWebhook({ headers: HEADERS, rawBody: "{}" }),
    ).toBe(false);
  });
});

describe("readCaptureFromWebhook", () => {
  it("pulls the booking reference, amount and fee out of a capture resource", async () => {
    const { readCaptureFromWebhook } = await loadPaypal();
    const capture = readCaptureFromWebhook({
      id: "CAP-1",
      status: "COMPLETED",
      custom_id: "GLJ-ABC123",
      amount: { value: "40.31", currency_code: "USD" },
      seller_receivable_breakdown: { paypal_fee: { value: "1.85", currency_code: "USD" } },
    });

    expect(capture).toMatchObject({
      captureId: "CAP-1",
      completed: true,
      amount: "40.31",
      currency: "USD",
      feeAmount: 1.85,
      bookingReference: "GLJ-ABC123",
    });
  });

  it("does not report a pending capture as completed", async () => {
    const { readCaptureFromWebhook } = await loadPaypal();
    expect(
      readCaptureFromWebhook({ id: "CAP-2", status: "PENDING" }).completed,
    ).toBe(false);
  });
});

describe("paypalFeeAsIdr", () => {
  it("converts the fee at the charge's own rate", async () => {
    vi.resetModules();
    const { paypalFeeAsIdr } = await import("@/lib/psp");
    // gatewayFee is an IDR column; PayPal reports its fee in USD.
    expect(paypalFeeAsIdr(1.85, 16_250)).toBe(30_063);
  });

  it("returns null rather than a wrong number when inputs are unusable", async () => {
    vi.resetModules();
    const { paypalFeeAsIdr } = await import("@/lib/psp");
    expect(paypalFeeAsIdr(null, 16_250)).toBeNull();
    expect(paypalFeeAsIdr(1.85, null)).toBeNull();
    expect(paypalFeeAsIdr(1.85, 0)).toBeNull();
  });
});

/**
 * A booking rendered a PayPal button, the customer clicked it, and only then did
 * PayPal answer invalid_client. Presence of the env vars is not proof they work,
 * and a broken second option is worse than none for someone whose card has
 * already been declined once.
 */
describe("paypalCredentialsWork", () => {
  const withKeys = () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "AeF-live-client-id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "EL-secret");
  };

  it("is false when nothing is configured, without calling out", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { paypalCredentialsWork } = await loadPaypal();
    expect(await paypalCredentialsWork()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is true when the token endpoint issues a token", async () => {
    withKeys();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ access_token: "tok", expires_in: 32400 }),
    })));
    const { paypalCredentialsWork } = await loadPaypal();
    expect(await paypalCredentialsWork()).toBe(true);
  });

  it("is false on invalid_client and does not throw", async () => {
    // The exact failure from the production log.
    withKeys();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "invalid_client" }),
    })));
    const { paypalCredentialsWork } = await loadPaypal();
    await expect(paypalCredentialsWork()).resolves.toBe(false);
  });

  it("does not re-request inside the cooldown after a failure", async () => {
    withKeys();
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "invalid_client" }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const { paypalCredentialsWork } = await loadPaypal();

    expect(await paypalCredentialsWork()).toBe(false);
    expect(await paypalCredentialsWork()).toBe(false);
    // A broken configuration must not add an OAuth round-trip to every render.
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
