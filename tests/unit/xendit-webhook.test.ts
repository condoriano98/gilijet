import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * The Xendit webhook is authenticated by the x-callback-token header matching
 * XENDIT_WEBHOOK_VERIFICATION_TOKEN (timing-safe). Fails closed when unset.
 */
describe("verifyWebhookToken (Xendit)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts the exact token and rejects anything else", async () => {
    vi.stubEnv("XENDIT_WEBHOOK_VERIFICATION_TOKEN", "tok_ABC123");
    vi.resetModules();
    const { verifyWebhookToken } = await import("@/lib/xendit");
    expect(verifyWebhookToken("tok_ABC123")).toBe(true);
    expect(verifyWebhookToken("tok_wrong")).toBe(false);
    expect(verifyWebhookToken(null)).toBe(false);
  });

  it("fails closed when the token is unset", async () => {
    vi.resetModules();
    const { verifyWebhookToken } = await import("@/lib/xendit");
    expect(verifyWebhookToken("anything")).toBe(false);
  });
});
