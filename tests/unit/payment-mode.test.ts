import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Runtime gateway sandbox/live overrides (lib/payment-mode.ts + the setters in
 * lib/midtrans.ts / lib/paypal.ts). The env flags stay the default; the
 * override is the staging-only knob that forces the host without a redeploy.
 */

const mocks = vi.hoisted(() => ({ configFind: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: { platformConfig: { findUnique: mocks.configFind } },
}));

async function loadMidtrans() {
  vi.resetModules();
  return import("@/lib/midtrans");
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

describe("Midtrans runtime mode override", () => {
  const withKeys = () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", "SB-Mid-server-1234567890");
  };

  it("forces the sandbox host even when MIDTRANS_IS_PRODUCTION=true", async () => {
    withKeys();
    vi.stubEnv("MIDTRANS_IS_PRODUCTION", "true");
    const midtrans = await loadMidtrans();
    midtrans.setMidtransModeOverride("SANDBOX");

    expect(midtrans.pingMidtrans()).toMatchObject({
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
              token: "snap-token",
              redirect_url: "https://app.sandbox.midtrans.com/snap/v2/vtweb/x",
            }),
        };
      }),
    );

    const result = await midtrans.createCheckout({
      orderId: "BK-1",
      amount: 650000,
      payerName: "Ayu",
      payerEmail: "ayu@example.com",
      payerPhone: "081234000111",
      callbackUrl: "https://gilifast.com/b/BK-1",
    });
    expect(urls[0]).toBe(
      "https://app.sandbox.midtrans.com/snap/v1/transactions",
    );
    expect(result.paymentUrl).toContain("app.sandbox.midtrans.com");
  });

  it("forces the live host when MIDTRANS_IS_PRODUCTION=false", async () => {
    withKeys();
    vi.stubEnv("MIDTRANS_IS_PRODUCTION", "false");
    const midtrans = await loadMidtrans();
    midtrans.setMidtransModeOverride("LIVE");
    expect(midtrans.pingMidtrans()).toMatchObject({ mode: "live", override: "LIVE" });
  });

  it("ENV keeps following the env flag", async () => {
    withKeys();
    vi.stubEnv("MIDTRANS_IS_PRODUCTION", "false");
    const midtrans = await loadMidtrans();
    expect(midtrans.pingMidtrans()).toMatchObject({ mode: "sandbox", override: "ENV" });
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
      midtransMode: "SANDBOX",
      paypalMode: "SANDBOX",
    });
    vi.stubEnv("MIDTRANS_SERVER_KEY", "sk");
    vi.stubEnv("PAYPAL_CLIENT_ID", "pid");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "psk");
    vi.stubEnv("MIDTRANS_IS_PRODUCTION", "true");
    vi.stubEnv("PAYPAL_IS_PRODUCTION", "true");

    vi.resetModules();
    const { applyGatewayModeOverrides } = await import("@/lib/payment-mode");
    const midtrans = await import("@/lib/midtrans");
    const paypal = await import("@/lib/paypal");

    await applyGatewayModeOverrides();

    expect(midtrans.pingMidtrans().mode).toBe("sandbox");
    expect(midtrans.pingMidtrans().override).toBe("SANDBOX");
    expect(paypal.pingPaypal().mode).toBe("sandbox");
    expect(paypal.pingPaypal().override).toBe("SANDBOX");
  });

  it("defaults to ENV when the config row is missing", async () => {
    mocks.configFind.mockReset().mockResolvedValue(null);
    vi.stubEnv("MIDTRANS_SERVER_KEY", "sk");
    vi.stubEnv("PAYPAL_CLIENT_ID", "pid");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "psk");
    vi.stubEnv("MIDTRANS_IS_PRODUCTION", "false");
    vi.stubEnv("PAYPAL_IS_PRODUCTION", "false");

    vi.resetModules();
    const { applyGatewayModeOverrides } = await import("@/lib/payment-mode");
    const midtrans = await import("@/lib/midtrans");
    const paypal = await import("@/lib/paypal");

    await applyGatewayModeOverrides();

    expect(midtrans.pingMidtrans()).toMatchObject({ mode: "sandbox", override: "ENV" });
    expect(paypal.pingPaypal()).toMatchObject({
      mode: "sandbox",
      override: "ENV",
    });
  });
});