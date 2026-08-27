import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import type { GatewayModeOverride } from "./payment-mode";

/**
 * Midtrans Snap — the payment gateway for gilifast.
 *
 * Snap is a hosted payment page: we POST /snap/v1/transactions with the order
 * details, get back a redirect_url, and send the customer there. They pick a
 * channel (virtual account, QRIS, e-wallet, card, convenience store) on
 * Midtrans' page, and Midtrans notifies us over HTTP when the payment lands.
 *
 * Everything settles in IDR: the booking's IDR total is what gets charged,
 * with no currency conversion anywhere in the flow.
 *
 * MOCK MODE: when MIDTRANS_SERVER_KEY is absent or starts with "test_mock_"
 * every call returns a dummy checkout that the frontend routes to the built-in
 * /checkout flow.
 *
 * Authentication uses HTTP Basic with the server key as the username and an
 * empty password. Inbound notifications are verified by recomputing the
 * signature_key SHA-512 over order_id + status_code + gross_amount + server key.
 *
 * Docs: https://docs.midtrans.com/en/snap/overview
 * Signature: https://docs.midtrans.com/en/technical-reference/signature
 */

export class MidtransNotConfiguredError extends Error {
  constructor() {
    super("MIDTRANS_SERVER_KEY is not configured");
    this.name = "MidtransNotConfiguredError";
  }
}

const SNAP_PATH = "/snap/v1/transactions";

/** Path Midtrans POSTs notifications to; used in docs and diagnostics. */
export const NOTIFICATION_PATH = "/api/webhooks/midtrans";

const LIVE_BASE = "https://app.midtrans.com";
const SANDBOX_BASE = "https://app.sandbox.midtrans.com";

/**
 * Runtime host override, set by lib/payment-mode.ts from the PlatformConfig
 * row. ENV (the default) follows the MIDTRANS_IS_PRODUCTION flag.
 */
let modeOverride: GatewayModeOverride = "ENV";

export function setMidtransModeOverride(mode: GatewayModeOverride): void {
  modeOverride = mode;
}

/** Live host or not: a console override wins, then the env flag. */
function effectiveProduction(): boolean {
  if (modeOverride === "SANDBOX") return false;
  if (modeOverride === "LIVE") return true;
  return env.MIDTRANS_IS_PRODUCTION;
}

function baseUrl(): string {
  return effectiveProduction() ? LIVE_BASE : SANDBOX_BASE;
}

export function isMidtransConfigured(): boolean {
  return Boolean(env.MIDTRANS_SERVER_KEY);
}

export function isMidtransMock(): boolean {
  const key = env.MIDTRANS_SERVER_KEY;
  return !isMidtransConfigured() || Boolean(key?.startsWith("test_mock_"));
}

/** True when a real (non-mock) Midtrans gateway can take money. */
export function isMidtransLive(): boolean {
  return isMidtransConfigured() && !isMidtransMock();
}

// ─── Signature ──────────────────────────────────────────────────────────────

/**
 * Midtrans signs notification payloads with a signature_key computed as the
 * SHA-512 hex digest of `order_id + status_code + gross_amount + server key`,
 * concatenated in that exact order with no separators.
 */
export function computeSignature(args: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
}): string {
  const raw = `${args.orderId}${args.statusCode}${args.grossAmount}${args.serverKey}`;
  return createHash("sha512").update(raw, "utf8").digest("hex");
}

// ─── Create checkout ────────────────────────────────────────────────────────

export type CreateCheckoutParams = {
  /** Our bookingReference — Midtrans' order_id, echoed back on notify. */
  orderId: string;
  /** Integer IDR. Midtrans rejects fractional amounts. */
  amount: number;
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  /** Where Midtrans returns the customer after payment. */
  callbackUrl: string;
  expiryMinutes?: number;
};

export type CreateCheckoutResult = {
  /** Midtrans' hosted Snap payment page. */
  paymentUrl: string;
  /** Correlation handle stored as Payment.gatewayReference. */
  orderId: string;
  sessionId: string | null;
};

export async function createCheckout(
  params: CreateCheckoutParams,
): Promise<CreateCheckoutResult> {
  if (isMidtransMock()) {
    return {
      paymentUrl: `/checkout/${params.orderId}`,
      orderId: params.orderId,
      sessionId: null,
    };
  }
  if (!isMidtransConfigured()) throw new MidtransNotConfiguredError();

  const serverKey = env.MIDTRANS_SERVER_KEY as string;

  const rawBody = JSON.stringify({
    transaction_details: {
      order_id: params.orderId,
      gross_amount: Math.round(params.amount),
    },
    customer_details: {
      first_name: sanitizeMidtransName(params.payerName),
      email: params.payerEmail,
      phone: params.payerPhone.replace(/[^\d]/g, ""),
    },
    expiry: {
      unit: "minutes",
      duration: params.expiryMinutes ?? 60,
    },
    credit_card: {
      secure: true,
    },
    callbacks: {
      finish: params.callbackUrl,
    },
  });

  const res = await fetch(`${baseUrl()}${SNAP_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
    },
    body: rawBody,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `MIDTRANS ${baseUrl()}${SNAP_PATH} ${res.status}: ${text.slice(0, 500)}`,
    );
  }

  const json = (text ? JSON.parse(text) : {}) as {
    token?: string;
    redirect_url?: string;
  };
  const paymentUrl = json.redirect_url;
  if (!paymentUrl) {
    throw new Error("Midtrans Snap: missing redirect_url in response");
  }

  return {
    paymentUrl,
    orderId: params.orderId,
    sessionId: json.token ?? null,
  };
}

/**
 * Midtrans rejects names with certain special characters ("first_name contains
 * forbidden characters"). The booking name is free text a customer typed, so
 * strip everything that is not a letter or a space before sending, and fall
 * back to a neutral label if nothing survives.
 */
export function sanitizeMidtransName(raw: string): string {
  const cleaned = raw
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Customer";
}

// ─── Notification verification ──────────────────────────────────────────────

export type MidtransNotificationHeaders = {
  contentType: string;
};

export function readNotificationHeaders(h: Headers): MidtransNotificationHeaders {
  return { contentType: h.get("content-type") ?? "" };
}

/**
 * Verify an incoming Midtrans notification by recomputing the signature_key
 * over the order_id, status_code and gross_amount in the payload and comparing
 * it to the one Midtrans sent. Fails closed: missing credentials or signature
 * means we cannot prove the caller is Midtrans, so we do not trust it.
 */
export function verifyMidtransNotification(args: {
  payload: Record<string, unknown>;
  serverKey?: string;
}): boolean {
  const serverKey = args.serverKey ?? env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return false;

  const { order_id, status_code, gross_amount, signature_key } = args.payload;
  if (
    typeof order_id !== "string" ||
    typeof status_code !== "string" ||
    typeof signature_key !== "string"
  ) {
    return false;
  }
  // gross_amount may arrive as a JSON number; Midtrans signs the string form.
  const grossAmount = String(gross_amount);

  const expected = computeSignature({
    orderId: order_id,
    statusCode: status_code,
    grossAmount,
    serverKey,
  });

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature_key, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Payment states Midtrans reports on a notification. */
export type MidtransNotification = {
  orderId: string | null;
  /** transaction_status verbatim. */
  status: string;
  /** True only for a settled payment; anything else must not issue tickets. */
  success: boolean;
  amount: number | null;
  /** payment_type verbatim (bank_transfer, qris, credit_card, …). */
  paymentType: string | null;
  transactionId: string | null;
  failureReason: string | null;
  fraudStatus: string | null;
};

/**
 * Normalise a Midtrans transaction_status into success/failure.
 *
 * Midtrans reports a wide surface of states; only a payment that actually
 * settled counts as success. Cards additionally carry a fraud_status that must
 * be `accept` (or absent) — a `challenge` is not money in the bank yet.
 */
export function readNotification(
  payload: Record<string, unknown>,
): MidtransNotification {
  const status = String(payload.transaction_status ?? "").toLowerCase();
  const fraud = payload.fraud_status
    ? String(payload.fraud_status).toLowerCase()
    : null;
  const fraudAccepted = fraud === null || fraud === "accept";

  const success =
    (status === "capture" || status === "settlement") && fraudAccepted;

  const rawAmount = payload.gross_amount;
  const amount =
    rawAmount === undefined ? null : Number(String(rawAmount).replace(/[^\d.]/g, ""));

  const failureReason = !success
    ? (payload.status_message
        ? String(payload.status_message)
        : status) || null
    : null;

  return {
    orderId: payload.order_id ? String(payload.order_id) : null,
    status,
    success,
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    paymentType: payload.payment_type ? String(payload.payment_type) : null,
    transactionId: payload.transaction_id ? String(payload.transaction_id) : null,
    failureReason,
    fraudStatus: fraud,
  };
}

// ─── Refunds ────────────────────────────────────────────────────────────────

/**
 * Midtrans refunds are raised from the Midtrans dashboard for the MVP.
 * Returning null signals the manual flow to lib/refund-gateway.ts rather than
 * pretending a refund was issued.
 */
export async function refundPayment(_args: {
  orderId: string;
  amount: number;
  reason: string;
}): Promise<{ id: string; status: string } | null> {
  return null;
}

/** Read-only diagnostic — no funds move. */
export function pingMidtrans(): {
  ok: boolean;
  mode: "live" | "sandbox" | "mock";
  serverKeyPrefix: string;
  secretPresent: boolean;
  /** The console override applied, ENV when the env flag decides. */
  override: GatewayModeOverride;
} {
  const mode = !isMidtransConfigured()
    ? "mock"
    : effectiveProduction()
      ? "live"
      : "sandbox";
  return {
    ok: isMidtransConfigured(),
    mode,
    serverKeyPrefix: env.MIDTRANS_SERVER_KEY
      ? env.MIDTRANS_SERVER_KEY.slice(0, 8) + "…"
      : "",
    secretPresent: Boolean(env.MIDTRANS_SERVER_KEY),
    override: modeOverride,
  };
}

// ─── Correlation ids ────────────────────────────────────────────────────────

/** Unique request id for Midtrans requests. */
export function requestId(): string {
  return randomUUID();
}
