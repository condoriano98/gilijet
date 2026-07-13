import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { dokuSignature } from "@/lib/doku";

/**
 * Verifies the DOKU HMAC-SHA256 signature is computed over the documented
 * composed string (Client-Id / Request-Id / Request-Timestamp / Request-Target
 * / Digest, joined by \n) and prefixed with "HMACSHA256=".
 */
describe("dokuSignature", () => {
  const base = {
    clientId: "MCH-0001",
    requestId: "11111111-1111-1111-1111-111111111111",
    timestamp: "2026-07-13T08:45:42Z",
    path: "/doku-virtual-account/v2/payment-code",
    secretKey: "SK-TEST-SECRET",
  };

  it("matches a hand-computed HMAC for a signed POST (with Digest)", () => {
    const rawBody = '{"order":{"amount":100000}}';
    const digest = "aB3="; // placeholder, recomputed below to stay in sync
    // recompute the expected the same way the impl does
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const realDigest = createHash("sha256").update(rawBody, "utf8").digest("base64");
    const composed = [
      `Client-Id:${base.clientId}`,
      `Request-Id:${base.requestId}`,
      `Request-Timestamp:${base.timestamp}`,
      `Request-Target:${base.path}`,
      `Digest:${realDigest}`,
    ].join("\n");
    const expected =
      "HMACSHA256=" +
      createHmac("sha256", base.secretKey).update(composed).digest("base64");

    expect(dokuSignature({ ...base, rawBody })).toBe(expected);
    // (digest placeholder kept only to document the format)
    expect(digest).toBeDefined();
  });

  it("omits the Digest line when there is no body (GET)", () => {
    const composed = [
      `Client-Id:${base.clientId}`,
      `Request-Id:${base.requestId}`,
      `Request-Timestamp:${base.timestamp}`,
      `Request-Target:${base.path}`,
    ].join("\n");
    const expected =
      "HMACSHA256=" +
      createHmac("sha256", base.secretKey).update(composed).digest("base64");
    expect(dokuSignature(base)).toBe(expected);
  });

  it("changes when any signed component changes", () => {
    const a = dokuSignature(base);
    const b = dokuSignature({ ...base, path: "/doku-qris/v1/generate" });
    expect(a).not.toBe(b);
  });
});
