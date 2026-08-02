import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";

/**
 * Midtrans notifications are authenticated by
 * signature_key = SHA512(order_id + status_code + gross_amount + ServerKey).
 */
describe("verifyMidtransWebhook", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts a correct signature and rejects tampering", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", "SB-Mid-server-KEY");
    vi.resetModules();
    const { verifyMidtransWebhook } = await import("@/lib/midtrans");
    const order_id = "GLJ1", status_code = "200", gross_amount = "300000.00";
    const signature_key = createHash("sha512")
      .update(`${order_id}${status_code}${gross_amount}SB-Mid-server-KEY`)
      .digest("hex");
    expect(verifyMidtransWebhook({ order_id, status_code, gross_amount, signature_key })).toBe(true);
    expect(verifyMidtransWebhook({ order_id, status_code, gross_amount: "1.00", signature_key })).toBe(false);
    expect(verifyMidtransWebhook({ order_id, status_code, gross_amount, signature_key: "deadbeef" })).toBe(false);
  });

  it("fails closed when the server key is unset", async () => {
    vi.resetModules();
    const { verifyMidtransWebhook } = await import("@/lib/midtrans");
    expect(verifyMidtransWebhook({ order_id: "o", signature_key: "x" })).toBe(false);
  });
});

/**
 * Cards are PayPal's job. Snap offers every channel it supports unless
 * enabled_payments is sent, so a dropped list silently puts cards back.
 */
describe("createSnapTransaction channels", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("does not offer credit_card, and does offer the local rails", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", "SB-Mid-server-KEY");
    vi.stubEnv("MIDTRANS_CLIENT_KEY", "SB-Mid-client-KEY");
    vi.resetModules();

    let sent: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body?: string }) => {
        sent = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ token: "tok", redirect_url: "u" }),
        };
      }),
    );

    const { createSnapTransaction } = await import("@/lib/midtrans");
    await createSnapTransaction({
      orderId: "GLJ-1",
      amount: 650_000,
      payerName: "A",
      payerEmail: "a@example.com",
      payerPhone: "+62 812 0000 0000",
      finishUrl: "https://example.com/b/GLJ-1",
    });

    const enabled = sent.enabled_payments as string[];
    expect(enabled).toBeDefined();
    expect(enabled).not.toContain("credit_card");
    expect(enabled).toEqual(expect.arrayContaining(["qris", "gopay", "bca_va"]));
  });
});

/**
 * Snap needs both halves: the server key signs the transaction call, the client
 * key authenticates Snap.js in the browser. A server-key-only config mints a
 * token and then hands the customer a button that cannot open.
 */
describe("isMidtransConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("requires the client key as well as the server key", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", "SB-Mid-server-KEY");
    vi.resetModules();
    const serverOnly = await import("@/lib/midtrans");
    expect(serverOnly.isMidtransConfigured()).toBe(false);
    // Falls back to the dummy checkout rather than a dead pay button.
    expect(serverOnly.isMidtransMock()).toBe(true);
    expect(serverOnly.pingMidtrans().clientKeyPresent).toBe(false);

    vi.stubEnv("MIDTRANS_CLIENT_KEY", "SB-Mid-client-KEY");
    vi.resetModules();
    const both = await import("@/lib/midtrans");
    expect(both.isMidtransConfigured()).toBe(true);
    expect(both.isMidtransMock()).toBe(false);
    expect(both.pingMidtrans()).toMatchObject({
      ok: true,
      mode: "sandbox",
      clientKeyPresent: true,
    });
  });

  it("reports live mode only when production is switched on", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", "Mid-server-KEY");
    vi.stubEnv("MIDTRANS_CLIENT_KEY", "Mid-client-KEY");
    vi.stubEnv("MIDTRANS_IS_PRODUCTION", "true");
    vi.resetModules();
    const { pingMidtrans } = await import("@/lib/midtrans");
    expect(pingMidtrans().mode).toBe("live");
  });
});
