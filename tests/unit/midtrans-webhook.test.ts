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
