import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";

/**
 * Midtrans signs notification payloads with a signature_key computed as the
 * SHA-512 hex digest of order_id + status_code + gross_amount + server key,
 * concatenated with no separators. Getting this wrong on the inbound side
 * means accepting forged payment notifications and issuing free tickets, which
 * is silent, so these lean on the notification path.
 */

const SERVER_KEY = "SB-Mid-server-secret-key";

async function loadMidtrans() {
  vi.resetModules();
  return import("@/lib/midtrans");
}

/** Independent reimplementation, so the test does not just echo the code. */
function expectedSignature(args: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
}) {
  const raw = `${args.orderId}${args.statusCode}${args.grossAmount}${SERVER_KEY}`;
  return createHash("sha512").update(raw, "utf8").digest("hex");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("computeSignature", () => {
  it("is the SHA-512 hex digest of the concatenated fields", async () => {
    const { computeSignature } = await loadMidtrans();
    const out = computeSignature({
      orderId: "GLJ-1",
      statusCode: "200",
      grossAmount: "650000.00",
      serverKey: SERVER_KEY,
    });
    expect(out).toBe(
      expectedSignature({
        orderId: "GLJ-1",
        statusCode: "200",
        grossAmount: "650000.00",
      }),
    );
    expect(out).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe("verifyMidtransNotification", () => {
  const payloadFor = (over: Record<string, unknown> = {}) => {
    const base = {
      order_id: "GLJ-1",
      status_code: "200",
      gross_amount: "650000.00",
      transaction_status: "settlement",
    };
    const sig = expectedSignature({
      orderId: String(base.order_id),
      statusCode: String(base.status_code),
      grossAmount: String(base.gross_amount),
    });
    return { ...base, signature_key: sig, ...over };
  };

  it("accepts a correctly signed notification", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", SERVER_KEY);
    const { verifyMidtransNotification } = await loadMidtrans();
    expect(
      verifyMidtransNotification({ payload: payloadFor() }),
    ).toBe(true);
  });

  it("rejects a tampered body even with the original signature", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", SERVER_KEY);
    const { verifyMidtransNotification } = await loadMidtrans();
    const payload = payloadFor();
    // Same signature, amount edited down — the classic forgery.
    payload.gross_amount = "1.00";
    expect(verifyMidtransNotification({ payload })).toBe(false);
  });

  it("fails closed when the server key is unset", async () => {
    const { verifyMidtransNotification } = await loadMidtrans();
    expect(verifyMidtransNotification({ payload: payloadFor() })).toBe(false);
  });

  it("rejects a notification signed with a different server key", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", "SB-Mid-server-somebody-else");
    const { verifyMidtransNotification } = await loadMidtrans();
    expect(verifyMidtransNotification({ payload: payloadFor() })).toBe(false);
  });

  it("rejects when any signature field is missing", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", SERVER_KEY);
    const { verifyMidtransNotification } = await loadMidtrans();
    for (const missing of ["order_id", "status_code", "gross_amount", "signature_key"] as const) {
      const payload = payloadFor();
      delete payload[missing];
      expect(verifyMidtransNotification({ payload }), missing).toBe(false);
    }
  });
});

describe("sanitizeMidtransName", () => {
  it("keeps letters and spaces, and drops special characters", async () => {
    const { sanitizeMidtransName } = await loadMidtrans();
    expect(sanitizeMidtransName("asdkfjaafdls;jk")).toBe("asdkfjaafdls jk");
    expect(sanitizeMidtransName("Mr. John O'Brien - Smith")).toBe("Mr John O Brien Smith");
  });

  it("collapses whitespace and trims", async () => {
    const { sanitizeMidtransName } = await loadMidtrans();
    expect(sanitizeMidtransName("  Iman   Manuel  ")).toBe("Iman Manuel");
  });

  it("falls back to a neutral label when nothing survives", async () => {
    const { sanitizeMidtransName } = await loadMidtrans();
    expect(sanitizeMidtransName("!!!;;;")).toBe("Customer");
    expect(sanitizeMidtransName("")).toBe("Customer");
  });

  it("keeps accented letters", async () => {
    const { sanitizeMidtransName } = await loadMidtrans();
    expect(sanitizeMidtransName("José da Silva")).toBe("José da Silva");
  });
});

describe("readNotification", () => {
  it("treats only capture/settlement as paid", async () => {
    const { readNotification } = await loadMidtrans();
    expect(
      readNotification({ transaction_status: "settlement" }).success,
    ).toBe(true);
    expect(
      readNotification({ transaction_status: "capture" }).success,
    ).toBe(true);
    for (const status of ["pending", "deny", "cancel", "expire", ""]) {
      expect(readNotification({ transaction_status: status }).success).toBe(false);
    }
  });

  it("does not settle a card flagged for fraud challenge", async () => {
    const { readNotification } = await loadMidtrans();
    expect(
      readNotification({
        transaction_status: "capture",
        fraud_status: "challenge",
      }).success,
    ).toBe(false);
    expect(
      readNotification({
        transaction_status: "capture",
        fraud_status: "accept",
      }).success,
    ).toBe(true);
  });

  it("carries a decline reason so a failure is not silently dropped", async () => {
    const { readNotification } = await loadMidtrans();
    const n = readNotification({
      transaction_status: "deny",
      status_message: "Card declined by issuer",
    });
    expect(n.success).toBe(false);
    expect(n.failureReason).toBe("Card declined by issuer");
  });

  it("falls back to the status when no reason field is present", async () => {
    const { readNotification } = await loadMidtrans();
    expect(readNotification({ transaction_status: "expire" }).failureReason).toBe(
      "expire",
    );
    expect(readNotification({ transaction_status: "settlement" }).failureReason).toBeNull();
  });

  it("pulls the order id, amount and payment type back out", async () => {
    const { readNotification } = await loadMidtrans();
    expect(
      readNotification({
        order_id: "GLJ-ABC123",
        gross_amount: "650000.00",
        transaction_status: "settlement",
        payment_type: "qris",
        transaction_id: "mid-1",
      }),
    ).toMatchObject({
      orderId: "GLJ-ABC123",
      amount: 650000,
      paymentType: "qris",
      transactionId: "mid-1",
      success: true,
    });
  });
});

describe("normalizePaymentMethod against Midtrans payment types", () => {
  it("maps every common payment type without throwing", async () => {
    const { normalizePaymentMethod } = await import("@/lib/psp");
    for (const pt of [
      "bank_transfer",
      "qris",
      "credit_card",
      "gopay",
      "shopeepay",
      "echannel",
      "cstore",
      "bank_transfer_va",
    ]) {
      expect(() => normalizePaymentMethod(pt), pt).not.toThrow();
    }
  });

  it("names the virtual accounts our enum knows individually", async () => {
    const { normalizePaymentMethod } = await import("@/lib/psp");
    expect(normalizePaymentMethod("bank_transfer_bca")).toBe("VA_BCA");
    expect(normalizePaymentMethod("bank_transfer_bni")).toBe("VA_BNI");
    expect(normalizePaymentMethod("bank_transfer_bri")).toBe("VA_BRI");
    expect(normalizePaymentMethod("bank_transfer_mandiri")).toBe("VA_MANDIRI");
    expect(normalizePaymentMethod("bank_transfer_permata")).toBe("VA_PERMATA");
    expect(normalizePaymentMethod("qris")).toBe("QRIS");
    expect(normalizePaymentMethod("gopay")).toBe("GOPAY");
    expect(normalizePaymentMethod("shopeepay")).toBe("SHOPEEPAY");
    // A bank we do not name individually is still a transfer, not a throw.
    expect(normalizePaymentMethod("cstore")).toBe("BANK_TRANSFER");
  });
});