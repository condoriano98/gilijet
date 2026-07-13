import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Verifies the DOKU notification signature check accepts a correctly-signed
 * request and rejects tampering / wrong path / missing config. Uses stubbed
 * env + a module reset so `lib/env` re-reads the DOKU keys.
 */
describe("verifyDokuNotification", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadConfigured() {
    vi.stubEnv("DOKU_CLIENT_ID", "MCH-0001");
    vi.stubEnv("DOKU_SECRET_KEY", "SK-TEST");
    vi.resetModules();
    return import("@/lib/doku");
  }

  it("accepts a valid signature and rejects tampering / wrong path", async () => {
    const { verifyDokuNotification, dokuSignature } = await loadConfigured();
    const path = "/api/webhooks/doku";
    const body = JSON.stringify({
      order: { invoice_number: "GLJ1" },
      transaction: { status: "SUCCESS" },
    });
    const clientId = "MCH-0001";
    const requestId = "rid-1";
    const timestamp = "2026-07-13T08:45:42Z";
    const signature = dokuSignature({
      clientId,
      requestId,
      timestamp,
      path,
      rawBody: body,
      secretKey: "SK-TEST",
    });
    const req = new Request("https://example.com" + path, {
      method: "POST",
      headers: {
        "Client-Id": clientId,
        "Request-Id": requestId,
        "Request-Timestamp": timestamp,
        Signature: signature,
      },
      body,
    });

    expect(verifyDokuNotification(req, body, path)).toBe(true);
    // tampered body
    expect(verifyDokuNotification(req, body + " ", path)).toBe(false);
    // wrong notification path (signature is path-bound)
    expect(verifyDokuNotification(req, body, "/api/webhooks/other")).toBe(false);
  });

  it("fails closed when a required header is missing", async () => {
    const { verifyDokuNotification } = await loadConfigured();
    const req = new Request("https://example.com/api/webhooks/doku", {
      method: "POST",
      headers: { "Client-Id": "MCH-0001" }, // no Signature/Request-Id/Timestamp
      body: "{}",
    });
    expect(verifyDokuNotification(req, "{}", "/api/webhooks/doku")).toBe(false);
  });

  it("fails closed when DOKU is unconfigured", async () => {
    vi.resetModules();
    const { verifyDokuNotification } = await import("@/lib/doku");
    const req = new Request("https://example.com/api/webhooks/doku", {
      method: "POST",
      headers: {
        "Client-Id": "c",
        "Request-Id": "r",
        "Request-Timestamp": "t",
        Signature: "HMACSHA256=whatever",
      },
      body: "{}",
    });
    expect(verifyDokuNotification(req, "{}", "/api/webhooks/doku")).toBe(false);
  });
});
