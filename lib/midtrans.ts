import { createHash } from "node:crypto";
import { env } from "./env";

/**
 * Midtrans Snap — single payment gateway for gilijet.
 *
 * Midtrans Snap is a hosted popup that handles every payment method
 * (bank-transfer VA, credit/debit card, GoPay, ShopeePay, QRIS, Alfamart,
 * Indomaret) through one API call.  We POST /snap/v1/transactions with a
 * Basic‑auth header (serverKey:), get back a snap‑token, then the frontend
 * loads midtrans‑snap.js and calls snap.pay(token).
 *
 * MOCK MODE: when MIDTRANS_SERVER_KEY is absent or starts with "test_mock_"
 * every call returns a dummy token that the frontend routes to the built‑in
 * dummy /checkout flow.
 *
 * Docs: https://docs.midtrans.com/reference/request-transaction-token
 * Webhook docs: https://docs.midtrans.com/reference/payment-notification
 */

export class MidtransNotConfiguredError extends Error {
  constructor() {
    super("MIDTRANS_SERVER_KEY is not configured");
    this.name = "MidtransNotConfiguredError";
  }
}

function baseUrl(): string {
  return env.MIDTRANS_IS_PRODUCTION
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

function requireServerKey(): string {
  if (!env.MIDTRANS_SERVER_KEY) throw new MidtransNotConfiguredError();
  return env.MIDTRANS_SERVER_KEY;
}

export function isMidtransConfigured(): boolean {
  return Boolean(env.MIDTRANS_SERVER_KEY);
}

export function isMidtransMock(): boolean {
  const k = env.MIDTRANS_SERVER_KEY;
  return !isMidtransConfigured() || Boolean(k?.startsWith("test_mock_"));
}

/** Basic‑auth header value: Base64(serverKey:) */
function basicAuth(serverKey: string): string {
  return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

// ─── Create Snap transaction ────────────────────────────────────────────────

export type CreateSnapParams = {
  orderId: string;       // our bookingReference
  amount: number;        // integer IDR
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  finishUrl: string;     // where to redirect after payment
  expiryMinutes?: number;
};

export type CreateSnapResult = {
  token: string;
  redirectUrl: string;
};

interface SnapResponse {
  token?: string;
  redirect_url?: string;
}

export async function createSnapTransaction(
  params: CreateSnapParams,
): Promise<CreateSnapResult> {
  if (isMidtransMock()) {
    return {
      token: `mock_${params.orderId}`,
      redirectUrl: `/checkout/${params.orderId}`,
    };
  }

  const serverKey = requireServerKey();
  const duration = params.expiryMinutes ?? 30;

  const body = JSON.stringify({
    transaction_details: {
      order_id: params.orderId,
      gross_amount: params.amount,
    },
    customer_details: {
      first_name: params.payerName,
      email: params.payerEmail,
      phone: params.payerPhone.replace(/[^\d]/g, ""),
    },
    callbacks: {
      finish: params.finishUrl,
    },
    expiry: {
      unit: "minutes",
      duration,
    },
  });

  const res = await fetch(`${baseUrl()}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(serverKey),
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Midtrans /snap/v1/transactions ${res.status}: ${text.slice(0, 500)}`,
    );
  }
  const json = (text ? JSON.parse(text) : {}) as SnapResponse;
  if (!json.token) {
    throw new Error("Midtrans Snap: missing token in response");
  }
  return {
    token: json.token,
    redirectUrl: json.redirect_url ?? `${baseUrl()}/snap/v1/transactions/${json.token}/redirect-url`,
  };
}

// ─── Webhook signature verification ─────────────────────────────────────────

/**
 * Midtrans signs notification POSTs with a SHA‑512 hash of
 *   orderId + statusCode + grossAmount + serverKey
 * The result is sent as the `signature_key` field in the JSON body.
 * We recompute and compare for authenticity.
 */
export function verifyMidtransWebhook(
  payload: Record<string, unknown>,
): boolean {
  if (!env.MIDTRANS_SERVER_KEY) return false;

  const orderId = String(payload.order_id ?? "");
  const statusCode = String(payload.status_code ?? payload.transaction_status ?? "");
  const grossAmount = String(payload.gross_amount ?? "0");
  const provided = String(payload.signature_key ?? "");

  if (!orderId || !provided) return false;

  const raw = orderId + statusCode + grossAmount + env.MIDTRANS_SERVER_KEY;
  const expected = createHash("sha512").update(raw).digest("hex");

  // Timing-safe comparison
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  try {
    return require("node:crypto").timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Read‑only diagnostic — no funds move. */
export function pingMidtrans(): {
  ok: boolean;
  mode: "live" | "sandbox" | "mock";
  keyPrefix: string;
} {
  const mode = !isMidtransConfigured()
    ? "mock"
    : env.MIDTRANS_IS_PRODUCTION
      ? "live"
      : "sandbox";
  return {
    ok: isMidtransConfigured(),
    mode,
    keyPrefix: env.MIDTRANS_SERVER_KEY
      ? env.MIDTRANS_SERVER_KEY.slice(0, 8) + "…"
      : "",
  };
}
