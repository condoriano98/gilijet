import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash, createHmac } from "node:crypto";

/**
 * DOKU signs a newline-joined component string with HMAC-SHA256 and sends it
 * base64-encoded behind an "HMACSHA256=" prefix. Getting this wrong on the
 * outbound side means rejected requests — loud and recoverable. Getting it
 * wrong on the inbound side means accepting forged payment notifications and
 * issuing free tickets, which is silent, so these lean on the notification path.
 */

const CLIENT_ID = "BRN-0001-1234567890";
const SECRET = "SK-secret-key";

async function loadDoku() {
  vi.resetModules();
  return import("@/lib/doku");
}

/** Independent reimplementation, so the test does not just echo the code. */
function expectedSignature(args: {
  clientId: string;
  requestId: string;
  timestamp: string;
  target: string;
  body: string;
}) {
  const digest = createHash("sha256").update(args.body, "utf8").digest("base64");
  const components = [
    `Client-Id:${args.clientId}`,
    `Request-Id:${args.requestId}`,
    `Request-Timestamp:${args.timestamp}`,
    `Request-Target:${args.target}`,
    `Digest:${digest}`,
  ].join("\n");
  const mac = createHmac("sha256", SECRET).update(components, "utf8").digest("base64");
  return `HMACSHA256=${mac}`;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("signature components", () => {
  it("joins one field per line with no trailing newline", async () => {
    const { signatureComponents } = await loadDoku();
    expect(
      signatureComponents({
        clientId: "C",
        requestId: "R",
        timestamp: "T",
        target: "/x",
        digest: "D",
      }),
    ).toBe("Client-Id:C\nRequest-Id:R\nRequest-Timestamp:T\nRequest-Target:/x\nDigest:D");
  });

  it("omits the Digest line entirely when there is no body", async () => {
    const { signatureComponents } = await loadDoku();
    const s = signatureComponents({
      clientId: "C",
      requestId: "R",
      timestamp: "T",
      target: "/x",
    });
    // An empty Digest line would still change the hash, so it must be absent.
    expect(s).not.toContain("Digest");
    expect(s.split("\n")).toHaveLength(4);
  });

  it("prefixes the base64 HMAC per DOKU's format", async () => {
    const { signComponents } = await loadDoku();
    const out = signComponents("abc", SECRET);
    expect(out.startsWith("HMACSHA256=")).toBe(true);
    expect(out.slice("HMACSHA256=".length)).toBe(
      createHmac("sha256", SECRET).update("abc", "utf8").digest("base64"),
    );
  });

  it("timestamps without fractional seconds", async () => {
    const { dokuTimestamp } = await loadDoku();
    expect(dokuTimestamp(new Date("2026-08-03T04:05:06.789Z"))).toBe(
      "2026-08-03T04:05:06Z",
    );
  });
});

describe("verifyDokuNotification", () => {
  const headersFor = (body: string, over: Record<string, string> = {}) => ({
    clientId: CLIENT_ID,
    requestId: "req-1",
    timestamp: "2026-08-03T04:05:06Z",
    signature: expectedSignature({
      clientId: CLIENT_ID,
      requestId: "req-1",
      timestamp: "2026-08-03T04:05:06Z",
      target: "/api/webhooks/doku",
      body,
    }),
    ...over,
  });

  it("accepts a correctly signed notification", async () => {
    vi.stubEnv("DOKU_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("DOKU_SECRET_KEY", SECRET);
    const { verifyDokuNotification } = await loadDoku();
    const rawBody = '{"order":{"invoice_number":"GLJ-1","amount":650000}}';
    expect(
      verifyDokuNotification({ headers: headersFor(rawBody), rawBody }),
    ).toBe(true);
  });

  it("rejects a tampered body even with the original signature", async () => {
    vi.stubEnv("DOKU_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("DOKU_SECRET_KEY", SECRET);
    const { verifyDokuNotification } = await loadDoku();
    const rawBody = '{"order":{"invoice_number":"GLJ-1","amount":650000}}';
    const headers = headersFor(rawBody);
    // Same signature, amount edited down — the classic forgery.
    const tampered = '{"order":{"invoice_number":"GLJ-1","amount":1}}';
    expect(verifyDokuNotification({ headers, rawBody: tampered })).toBe(false);
  });

  it("fails closed when credentials are unset", async () => {
    const { verifyDokuNotification } = await loadDoku();
    const rawBody = "{}";
    expect(
      verifyDokuNotification({ headers: headersFor(rawBody), rawBody }),
    ).toBe(false);
  });

  it("rejects a notification signed for a different client id", async () => {
    vi.stubEnv("DOKU_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("DOKU_SECRET_KEY", SECRET);
    const { verifyDokuNotification } = await loadDoku();
    const rawBody = "{}";
    expect(
      verifyDokuNotification({
        headers: headersFor(rawBody, { clientId: "BRN-9999-somebody-else" }),
        rawBody,
      }),
    ).toBe(false);
  });

  it("rejects when any signature header is missing", async () => {
    vi.stubEnv("DOKU_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("DOKU_SECRET_KEY", SECRET);
    const { verifyDokuNotification } = await loadDoku();
    const rawBody = "{}";
    for (const missing of ["requestId", "timestamp", "signature"] as const) {
      expect(
        verifyDokuNotification({
          headers: headersFor(rawBody, { [missing]: "" }),
          rawBody,
        }),
      ).toBe(false);
    }
  });

  it("rejects a signature computed for a different target path", async () => {
    vi.stubEnv("DOKU_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("DOKU_SECRET_KEY", SECRET);
    const { verifyDokuNotification } = await loadDoku();
    const rawBody = "{}";
    expect(
      verifyDokuNotification({
        headers: headersFor(rawBody),
        rawBody,
        target: "/api/webhooks/somewhere-else",
      }),
    ).toBe(false);
  });
});

describe("readNotification", () => {
  it("treats only SUCCESS as paid", async () => {
    const { readNotification } = await loadDoku();
    expect(
      readNotification({ transaction: { status: "SUCCESS" } }).success,
    ).toBe(true);
    for (const status of ["PENDING", "FAILED", "EXPIRED", ""]) {
      expect(readNotification({ transaction: { status } }).success).toBe(false);
    }
  });

  it("carries a decline reason so a failure is not silently dropped", async () => {
    const { readNotification } = await loadDoku();
    // DOKU's field name for this is not documented for Checkout, so several
    // plausible ones are accepted.
    for (const shape of [
      { transaction: { status: "FAILED", message: "Card declined by issuer" } },
      { transaction: { status: "FAILED", reason: "Card declined by issuer" } },
      { transaction: { status: "FAILED", response_message: "Card declined by issuer" } },
    ]) {
      expect(readNotification(shape).failureReason).toBe("Card declined by issuer");
    }
  });

  it("falls back to the status when no reason field is present", async () => {
    const { readNotification } = await loadDoku();
    // Losing the signal entirely would be worse than a coarse one.
    expect(readNotification({ transaction: { status: "FAILED" } }).failureReason).toBe(
      "FAILED",
    );
    expect(readNotification({ transaction: { status: "SUCCESS" } }).failureReason).toBeNull();
  });

  it("pulls the invoice number, amount and channel back out", async () => {
    const { readNotification } = await loadDoku();
    expect(
      readNotification({
        order: { invoice_number: "GLJ-ABC123", amount: 650000 },
        transaction: { status: "SUCCESS" },
        channel: { id: "VIRTUAL_ACCOUNT_BCA" },
        service: { id: "VIRTUAL_ACCOUNT" },
      }),
    ).toMatchObject({
      invoiceNumber: "GLJ-ABC123",
      amount: 650000,
      channelCode: "VIRTUAL_ACCOUNT_BCA",
      success: true,
    });
  });
});

/**
 * Channel ids taken verbatim from a live /checkout/v1/payment response for this
 * merchant, so the mapping is pinned to what DOKU actually sends rather than to
 * what the docs list.
 */
describe("normalizePaymentMethod against live DOKU channels", () => {
  const ENABLED = [
    "ONLINE_TO_OFFLINE_ALFA",
    "CREDIT_CARD",
    "ONLINE_TO_OFFLINE_INDOMARET",
    "PEER_TO_PEER_AKULAKU",
    "EMONEY_DOKU",
    "VIRTUAL_ACCOUNT_BRI",
    "VIRTUAL_ACCOUNT_BNI",
    "VIRTUAL_ACCOUNT_BANK_PERMATA",
    "VIRTUAL_ACCOUNT_DOKU",
    "VIRTUAL_ACCOUNT_BANK_CIMB",
    "VIRTUAL_ACCOUNT_BANK_DANAMON",
    "VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI",
    "VIRTUAL_ACCOUNT_MAYBANK",
    "VIRTUAL_ACCOUNT_BSS",
    "VIRTUAL_ACCOUNT_BANK_BJB",
    "VIRTUAL_ACCOUNT_BNC",
    "VIRTUAL_ACCOUNT_BTN",
    "VIRTUAL_ACCOUNT_SINARMAS",
  ];

  it("maps every enabled channel without throwing", async () => {
    const { normalizePaymentMethod } = await import("@/lib/psp");
    for (const channel of ENABLED) {
      expect(() => normalizePaymentMethod(channel), channel).not.toThrow();
    }
  });

  it("does not mistake Danamon's virtual account for the DANA e-wallet", async () => {
    const { normalizePaymentMethod } = await import("@/lib/psp");
    // "VIRTUAL_ACCOUNT_BANK_DANAMON" contains "DANA"; a substring match would
    // book a bank transfer as an e-wallet payment.
    expect(normalizePaymentMethod("VIRTUAL_ACCOUNT_BANK_DANAMON")).toBe(
      "BANK_TRANSFER",
    );
    expect(normalizePaymentMethod("EMONEY_DANA")).toBe("DANA");
  });

  it("still names the virtual accounts our enum knows individually", async () => {
    const { normalizePaymentMethod } = await import("@/lib/psp");
    expect(normalizePaymentMethod("VIRTUAL_ACCOUNT_BRI")).toBe("VA_BRI");
    expect(normalizePaymentMethod("VIRTUAL_ACCOUNT_BNI")).toBe("VA_BNI");
    expect(normalizePaymentMethod("VIRTUAL_ACCOUNT_BANK_PERMATA")).toBe("VA_PERMATA");
    expect(normalizePaymentMethod("VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI")).toBe(
      "VA_MANDIRI",
    );
    // A bank we do not name individually is still a transfer, not a throw.
    expect(normalizePaymentMethod("VIRTUAL_ACCOUNT_BTN")).toBe("BANK_TRANSFER");
  });
});
