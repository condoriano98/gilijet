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

/**
 * Separates the booking reference from the retry counter in an order id.
 *
 * Midtrans will not charge twice against one order_id, and a customer whose
 * card was declined has to be able to try again. Snap does not catch the reuse
 * when the token is created — it mints a second token happily and the charge
 * then fails with a 406 once the customer has picked a payment method, so a
 * reused id looks fine here and breaks in front of the customer.
 *
 * A tilde is the only safe separator: order ids allow `-`, `_`, `.` and `~`,
 * the booking reference already uses `-`, and its random suffix can be all
 * digits (`BK-2026-05-234567`), so stripping a trailing `-N` would eat part of
 * a legitimate reference.
 */
const ATTEMPT_SEPARATOR = "~";

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
      paymentUrl: `/checkout/${bookingReferenceFromOrderId(params.orderId)}`,
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
    const hint = /has already been taken|conflict/i.test(text)
      ? ` — order_id ${params.orderId} already exists at Midtrans; a retry needs a fresh counter (see nextOrderId).`
      : "";
    throw new Error(
      `MIDTRANS ${baseUrl()}${SNAP_PATH} ${res.status}: ${text.slice(0, 500)}${hint}`,
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

// ─── Order ids ──────────────────────────────────────────────────────────────

/**
 * Strip the retry counter off an order id to get back the booking reference.
 * Order ids that were never suffixed pass through unchanged.
 */
export function bookingReferenceFromOrderId(orderId: string): string {
  const i = orderId.indexOf(ATTEMPT_SEPARATOR);
  return i < 0 ? orderId : orderId.slice(0, i);
}

/**
 * The order id for the next attempt on a booking.
 *
 * Derived from the previously stored reference rather than a new column: that
 * reference already records which attempt is outstanding.
 */
export function nextOrderId(
  bookingReference: string,
  previousOrderId?: string | null,
): string {
  if (!previousOrderId) return bookingReference;
  if (bookingReferenceFromOrderId(previousOrderId) !== bookingReference) {
    // A reference from another booking (or another gateway) says nothing about
    // attempts on this one. Start over.
    return bookingReference;
  }
  const suffix = previousOrderId.slice(
    bookingReference.length + ATTEMPT_SEPARATOR.length,
  );
  const attempt = suffix ? Number(suffix) : 1;
  const next = Number.isInteger(attempt) && attempt >= 1 ? attempt + 1 : 2;
  return `${bookingReference}${ATTEMPT_SEPARATOR}${next}`;
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

// ─── Authoritative status lookup ────────────────────────────────────────────

/** Core API host — status lookups and refunds, as opposed to the Snap host. */
function apiBaseUrl(): string {
  return effectiveProduction()
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
}

/**
 * Ask Midtrans what actually happened to an order.
 *
 * The signature covers only order_id, status_code and gross_amount —
 * `transaction_status` is NOT signed. So a captured `pending` notification
 * (status_code 201) can be replayed with the status flipped to `settlement`
 * and it still verifies. That is not hypothetical here: the droplet serves
 * plain HTTP until APP_DOMAIN is set, which puts notifications on the wire in
 * the clear.
 *
 * The status endpoint answers over an authenticated channel and returns the
 * same field names as a notification, so `readNotification` reads its response
 * directly. Returns null when no answer can be obtained — callers must treat
 * that as "not confirmed", never as success.
 */
export async function fetchTransactionStatus(
  orderId: string,
): Promise<Record<string, unknown> | null> {
  const serverKey = env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return null;

  try {
    const res = await fetch(
      `${apiBaseUrl()}/v2/${encodeURIComponent(orderId)}/status`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
        },
      },
    );
    const text = await res.text();
    if (!text) return null;
    const json = JSON.parse(text) as Record<string, unknown>;
    // Midtrans answers 200 with the real outcome in status_code, so a 404
    // ("Transaction doesn't exist") arrives as an ordinary response body.
    if (json.status_code === "404" || json.status_code === "401") return null;
    return json;
  } catch (err) {
    console.error(`[midtrans] status lookup failed for ${orderId}:`, err);
    return null;
  }
}

/** Payment states Midtrans reports on a notification. */
export type MidtransNotification = {
  orderId: string | null;
  /** transaction_status verbatim. */
  status: string;
  /** True only for a settled payment; anything else must not issue tickets. */
  success: boolean;
  /**
   * True only for a terminally failed attempt. Distinct from `!success`:
   * Midtrans fires a `pending` notification the moment a VA number is issued,
   * which is the normal first step of a bank transfer. Treating that as a
   * decline tells a customer holding a live VA that their payment failed.
   */
  declined: boolean;
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
 *
 * Failure is reported separately from `!success` because most non-success
 * states are still in flight: see `declined`.
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

  // Terminal failures only. `pending` (VA issued, awaiting transfer),
  // `authorize` and a `capture` held at `challenge` are all still live, and
  // `refund` / `partial_refund` are bookkeeping on a payment that succeeded.
  const declined =
    status === "deny" ||
    status === "cancel" ||
    status === "expire" ||
    status === "failure";

  const rawAmount = payload.gross_amount;
  const amount =
    rawAmount === undefined ? null : Number(String(rawAmount).replace(/[^\d.]/g, ""));

  const failureReason = declined
    ? (payload.status_message
        ? String(payload.status_message)
        : status) || null
    : null;

  return {
    orderId: payload.order_id ? String(payload.order_id) : null,
    status,
    success,
    declined,
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
