import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Runtime gateway sandbox/live overrides (lib/payment-mode.ts + the setters in
 * lib/doku.ts / lib/paypal.ts). The env flags stay the default; the override
 * is the staging-only knob that forces the host without a redeploy.
 */

const mocks = vi.hoisted(() => ({ configFind: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: { platformConfig: { findUnique: mocks.configFind } },
}));

async function loadDoku() {
  vi.resetModules();
  return import("@/lib/doku");
}

async function loadPaypal() {
  vi.resetModules();
  return import("@/lib/paypal");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("DOKU runtime mode override", () => {
  const withKeys = () => {
    vi.stubEnv("DOKU_CLIENT_ID", "BRN-0001-1234567890");
    vi.stubEnv("DOKU_SECRET_KEY", "SK-secret-key");
  };

  it("forces the sandbox host even when DOKU_IS_PRODUCTION=true", async () => {
    withKeys();
    vi.stubEnv("DOKU_IS_PRODUCTION", "true");
    const doku = await loadDoku();
    doku.setDokuModeOverride("SANDBOX");

    expect(doku.pingDoku()).toMatchObject({
      mode: "sandbox",
      override: "SANDBOX",
    });

    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              response: {
                payment: { url: "https://checkout.doku.com/x" },
                order: { invoice_number: "BK-1" },
              },
            }),
        };
      }),
    );

    const result = await doku.createCheckout({
      orderId: "BK-1",
      amount: 650000,
      payerName: "Ayu",
      payerEmail: "ayu@example.com",
      payerPhone: "081234000111",
      callbackUrl: "https://gilifast.com/b/BK-1",
    });
    expect(urls[0]).toBe("https://api-sandbox.doku.com/checkout/v1/payment");
    expect(result.paymentUrl).toBe("https://checkout.doku.com/x");
  });

  it("forces the live host when DOKU_IS_PRODUCTION=false", async () => {
    withKeys();
    vi.stubEnv("DOKU_IS_PRODUCTION", "false");
    const doku = await loadDoku();
    doku.setDokuModeOverride("LIVE");
    expect(doku.pingDoku()).toMatchObject({ mode: "live", override: "LIVE" });
  });

  it("ENV keeps following the env flag", async () => {
    withKeys();
    vi.stubEnv("DOKU_IS_PRODUCTION", "false");
    const doku = await loadDoku();
    expect(doku.pingDoku()).toMatchObject({ mode: "sandbox", override: "ENV" });
  });
});

describe("PayPal runtime mode override", () => {
  const withKeys = () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "AeF-client-id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "EL-secret");
  };

  it("forces sandbox as the preferred host when PAYPAL_IS_PRODUCTION=true", async () => {
    withKeys();
    vi.stubEnv("PAYPAL_IS_PRODUCTION", "true");
    const paypal = await loadPaypal();
    paypal.setPaypalModeOverride("SANDBOX");
    expect(paypal.paypalHost()).toBe("sandbox");
    expect(paypal.pingPaypal()).toMatchObject({
      mode: "sandbox",
      modeProven: false,
      override: "SANDBOX",
    });
  });

  it("forces live as the preferred host when PAYPAL_IS_PRODUCTION=false", async () => {
    withKeys();
    vi.stubEnv("PAYPAL_IS_PRODUCTION", "false");
    const paypal = await loadPaypal();
    paypal.setPaypalModeOverride("LIVE");
    expect(paypal.paypalHost()).toBe("live");
  });

  it("sends orders to the forced host", async () => {
    withKeys();
    vi.stubEnv("PAYPAL_IS_PRODUCTION", "true");
    const paypal = await loadPaypal();
    paypal.setPaypalModeOverride("SANDBOX");

    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
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
          text: async () =>
            JSON.stringify({ id: "ORDER-1", status: "CREATED", links: [] }),
        };
      }),
    );

    await paypal.createOrder({
      orderId: "BK-1",
      amount: "40.00",
      currency: "USD",
      description: "Sanur → Nusa Lembongan",
      returnUrl: "https://x.test/r",
      cancelUrl: "https://x.test/c",
    });
    const orderCall = urls.find((u) => u.includes("/v2/checkout/orders"));
    expect(orderCall).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
  });

  it("flipping the override forgets the proven host and re-probes", async () => {
    withKeys();
    vi.stubEnv("PAYPAL_IS_PRODUCTION", "true");
    const paypal = await loadPaypal();

    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        // Only the live host accepts these credentials.
        if (!url.startsWith("https://api-m.paypal.com")) {
          return {
            ok: false,
            status: 401,
            text: async () => JSON.stringify({ error: "invalid_client" }),
          };
        }
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
          text: async () =>
            JSON.stringify({ id: "ORDER-1", status: "CREATED", links: [] }),
        };
      }),
    );

    paypal.setPaypalModeOverride("LIVE");
    expect(await paypal.paypalCredentialsWork()).toBe(true);
    expect(urls[0]).toContain("api-m.paypal.com");
    expect(paypal.paypalHost()).toBe("live");
    expect(paypal.paypalHostIsProven()).toBe(true);

    // Flip to sandbox: the proven live host is forgotten and the next attempt
    // starts at sandbox — but live keys cannot authenticate there, so
    // discovery still lands back on live.
    paypal.setPaypalModeOverride("SANDBOX");
    expect(paypal.paypalHost()).toBe("sandbox");
    expect(paypal.paypalHostIsProven()).toBe(false);

    expect(await paypal.paypalCredentialsWork()).toBe(true);
    expect(urls[1]).toContain("api-m.sandbox.paypal.com");
    expect(paypal.paypalHost()).toBe("live");
    expect(paypal.paypalHostIsProven()).toBe(true);
  });
});

describe("applyGatewayModeOverrides (PlatformConfig)", () => {
  it("pushes the stored modes into both gateways", async () => {
    mocks.configFind.mockReset().mockResolvedValue({
      dokuMode: "SANDBOX",
      paypalMode: "SANDBOX",
    });
    vi.stubEnv("DOKU_CLIENT_ID", "id");
    vi.stubEnv("DOKU_SECRET_KEY", "sk");
    vi.stubEnv("PAYPAL_CLIENT_ID", "pid");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "psk");
    vi.stubEnv("DOKU_IS_PRODUCTION", "true");
    vi.stubEnv("PAYPAL_IS_PRODUCTION", "true");

    vi.resetModules();
    const { applyGatewayModeOverrides } = await import("@/lib/payment-mode");
    const doku = await import("@/lib/doku");
    const paypal = await import("@/lib/paypal");

    await applyGatewayModeOverrides();

    expect(doku.pingDoku().mode).toBe("sandbox");
    expect(doku.pingDoku().override).toBe("SANDBOX");
    expect(paypal.pingPaypal().mode).toBe("sandbox");
    expect(paypal.pingPaypal().override).toBe("SANDBOX");
  });

  it("defaults to ENV when the config row is missing", async () => {
    mocks.configFind.mockReset().mockResolvedValue(null);
    vi.stubEnv("DOKU_CLIENT_ID", "id");
    vi.stubEnv("DOKU_SECRET_KEY", "sk");
    vi.stubEnv("PAYPAL_CLIENT_ID", "pid");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "psk");
    vi.stubEnv("DOKU_IS_PRODUCTION", "false");
    vi.stubEnv("PAYPAL_IS_PRODUCTION", "false");

    vi.resetModules();
    const { applyGatewayModeOverrides } = await import("@/lib/payment-mode");
    const doku = await import("@/lib/doku");
    const paypal = await import("@/lib/paypal");

    await applyGatewayModeOverrides();

    expect(doku.pingDoku()).toMatchObject({ mode: "sandbox", override: "ENV" });
    expect(paypal.pingPaypal()).toMatchObject({
      mode: "sandbox",
      override: "ENV",
    });
  });
});