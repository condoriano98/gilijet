import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import type { GatewayModeOverride } from "./payment-mode";

/**
 * DOKU Checkout — the payment gateway for gilifast.
 *
 * DOKU Checkout is a hosted payment page: we POST /checkout/v1/payment with a
 * signed request, get back a URL, and send the customer there. They pick a
 * channel (virtual account, QRIS, e-wallet, card, convenience store) on DOKU's
 * page, and DOKU notifies us over HTTP when the payment lands.
 *
 * Everything settles in IDR: the booking's IDR total is what gets charged,
 * with no currency conversion anywhere in the flow.
 *
 * MOCK MODE: when DOKU_CLIENT_ID is absent or starts with "test_mock_" every
 * call returns a dummy checkout that the frontend routes to the built-in
 * /checkout flow.
 *
 * Signature scheme (non-SNAP), per DOKU's "Signature Component from Request
 * Header" reference: build a newline-joined component string, HMAC-SHA256 it
 * with the shared secret, base64 the digest, prefix "HMACSHA256=".
 *
 * Docs: https://developers.doku.com/accept-payments/doku-checkout
 * Signature: https://developers.doku.com/get-started-with-doku-api/signature-component/non-snap/signature-component-from-request-header
 */

export class DokuNotConfiguredError extends Error {
  constructor() {
    super("DOKU_CLIENT_ID / DOKU_SECRET_KEY are not configured");
    this.name = "DokuNotConfiguredError";
  }
}

const CHECKOUT_PATH = "/checkout/v1/payment";

/** Path DOKU POSTs notifications to; also the Request-Target they sign with. */
export const NOTIFICATION_PATH = "/api/webhooks/doku";

const LIVE_BASE = "https://api.doku.com";
const SANDBOX_BASE = "https://api-sandbox.doku.com";

/**
 * Runtime host override, set by lib/payment-mode.ts from the PlatformConfig
 * row. ENV (the default) follows the DOKU_IS_PRODUCTION flag.
 */
let modeOverride: GatewayModeOverride = "ENV";

export function setDokuModeOverride(mode: GatewayModeOverride): void {
  modeOverride = mode;
}

/** Live host or not: a console override wins, then the env flag. */
function effectiveProduction(): boolean {
  if (modeOverride === "SANDBOX") return false;
  if (modeOverride === "LIVE") return true;
  return env.DOKU_IS_PRODUCTION;
}

function baseUrl(): string {
  return effectiveProduction() ? LIVE_BASE : SANDBOX_BASE;
}

export function isDokuConfigured(): boolean {
  return Boolean(env.DOKU_CLIENT_ID && env.DOKU_SECRET_KEY);
}

export function isDokuMock(): boolean {
  const id = env.DOKU_CLIENT_ID;
  return !isDokuConfigured() || Boolean(id?.startsWith("test_mock_"));
}

/** True when a real (non-mock) DOKU gateway can take money. */
export function isDokuLive(): boolean {
  return isDokuConfigured() && !isDokuMock();
}

// ─── Signature ──────────────────────────────────────────────────────────────

/** DOKU wants an ISO-8601 UTC timestamp with no fractional seconds. */
export function dokuTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Digest is the base64 SHA-256 of the raw JSON body, empty string when absent. */
export function bodyDigest(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("base64");
}

/**
 * The component string DOKU signs: one `Name:value` per line, joined by \n
 * with no trailing newline. Digest is omitted entirely for bodyless requests
 * rather than sent empty — an extra line changes the hash.
 */
export function signatureComponents(args: {
  clientId: string;
  requestId: string;
  timestamp: string;
  target: string;
  digest?: string;
}): string {
  const lines = [
    `Client-Id:${args.clientId}`,
    `Request-Id:${args.requestId}`,
    `Request-Timestamp:${args.timestamp}`,
    `Request-Target:${args.target}`,
  ];
  if (args.digest !== undefined) lines.push(`Digest:${args.digest}`);
  return lines.join("\n");
}

/** HMAC-SHA256 the components with the secret; base64; prefix per DOKU. */
export function signComponents(components: string, secretKey: string): string {
  const mac = createHmac("sha256", secretKey).update(components, "utf8").digest("base64");
  return `HMACSHA256=${mac}`;
}

// ─── Create checkout ────────────────────────────────────────────────────────

export type CreateCheckoutParams = {
  /** Our bookingReference — DOKU's invoice_number, echoed back on notify. */
  orderId: string;
  /** Integer IDR. DOKU rejects fractional amounts. */
  amount: number;
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  /** Where DOKU returns the customer after payment. */
  callbackUrl: string;
  expiryMinutes?: number;
};

export type CreateCheckoutResult = {
  /** DOKU's hosted payment page. */
  paymentUrl: string;
  /** Correlation handle stored as Payment.gatewayReference. */
  invoiceNumber: string;
  sessionId: string | null;
};

export async function createCheckout(
  params: CreateCheckoutParams,
): Promise<CreateCheckoutResult> {
  if (isDokuMock()) {
    return {
      paymentUrl: `/checkout/${params.orderId}`,
      invoiceNumber: params.orderId,
      sessionId: null,
    };
  }
  if (!isDokuConfigured()) throw new DokuNotConfiguredError();

  const clientId = env.DOKU_CLIENT_ID as string;
  const secretKey = env.DOKU_SECRET_KEY as string;
  const requestId = randomUUID();
  const timestamp = dokuTimestamp();

  const rawBody = JSON.stringify({
    order: {
      amount: Math.round(params.amount),
      invoice_number: params.orderId,
      currency: "IDR",
      callback_url: params.callbackUrl,
    },
    payment: {
      payment_due_date: params.expiryMinutes ?? 60,
    },
    customer: {
      name: params.payerName,
      email: params.payerEmail,
      phone: params.payerPhone.replace(/[^\d]/g, ""),
    },
  });

  const signature = signComponents(
    signatureComponents({
      clientId,
      requestId,
      timestamp,
      target: CHECKOUT_PATH,
      digest: bodyDigest(rawBody),
    }),
    secretKey,
  );

  const res = await fetch(`${baseUrl()}${CHECKOUT_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Id": clientId,
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      Signature: signature,
    },
    body: rawBody,
  });
  const text = await res.text();
  if (!res.ok) {
    const hint =
      /invalid_client_id/i.test(text)
        ? env.DOKU_IS_PRODUCTION
          ? ` — this Client-Id was rejected by the production host (${baseUrl()}). If these are sandbox credentials, set DOKU_IS_PRODUCTION=false.`
          : ` — this Client-Id is unknown to the sandbox host (${baseUrl()}). If these are live credentials, set DOKU_IS_PRODUCTION="true".`
        : "";
    throw new Error(
      `DOKU ${baseUrl()}${CHECKOUT_PATH} ${res.status}: ${text.slice(0, 500)}${hint}`,
    );
  }

  const json = (text ? JSON.parse(text) : {}) as {
    response?: {
      payment?: { url?: string; token_id?: string };
      order?: { invoice_number?: string; session_id?: string };
    };
  };
  const paymentUrl = json.response?.payment?.url;
  if (!paymentUrl) {
    throw new Error("DOKU checkout: missing payment url in response");
  }

  return {
    paymentUrl,
    invoiceNumber: json.response?.order?.invoice_number ?? params.orderId,
    sessionId: json.response?.order?.session_id ?? null,
  };
}

// ─── Notification verification ──────────────────────────────────────────────

export type DokuNotificationHeaders = {
  clientId: string;
  requestId: string;
  timestamp: string;
  signature: string;
};

export function readNotificationHeaders(h: Headers): DokuNotificationHeaders {
  return {
    clientId: h.get("client-id") ?? "",
    requestId: h.get("request-id") ?? "",
    timestamp: h.get("request-timestamp") ?? "",
    signature: h.get("signature") ?? "",
  };
}

/**
 * Verify an incoming DOKU notification by recomputing the signature over the
 * raw body. `rawBody` must be the exact bytes received — re-serialising parsed
 * JSON changes the digest even when the content is identical.
 *
 * Fails closed: missing credentials or any missing header means we cannot
 * prove the caller is DOKU, so we do not trust it.
 */
export function verifyDokuNotification(args: {
  headers: DokuNotificationHeaders;
  rawBody: string;
  /** Defaults to the registered notification path DOKU signs against. */
  target?: string;
}): boolean {
  if (!isDokuConfigured()) return false;

  const { headers } = args;
  if (
    !headers.clientId ||
    !headers.requestId ||
    !headers.timestamp ||
    !headers.signature
  ) {
    return false;
  }
  // A notification signed with someone else's Client-Id is not ours.
  if (headers.clientId !== env.DOKU_CLIENT_ID) return false;

  const expected = signComponents(
    signatureComponents({
      clientId: headers.clientId,
      requestId: headers.requestId,
      timestamp: headers.timestamp,
      target: args.target ?? NOTIFICATION_PATH,
      digest: bodyDigest(args.rawBody),
    }),
    env.DOKU_SECRET_KEY as string,
  );

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(headers.signature, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Payment states DOKU reports on a notification. */
export type DokuNotification = {
  invoiceNumber: string | null;
  status: string;
  /** True only for a settled payment; anything else must not issue tickets. */
  success: boolean;
  amount: number | null;
  channelCode: string | null;
  identifier: string | null;
  /**
   * Whatever the notification says about *why* a payment failed. DOKU's exact
   * field name for this is not documented for Checkout, so several plausible
   * ones are tried and the raw payload is stored alongside — the parse can be
   * tightened once real declines have been seen.
   */
  failureReason: string | null;
};

/** First non-empty of the fields DOKU might carry a decline reason in. */
function readFailureReason(
  payload: Record<string, unknown>,
  transaction: Record<string, unknown>,
  status: string,
): string | null {
  const candidates = [
    transaction.message,
    transaction.reason,
    transaction.response_message,
    transaction.failure_reason,
    payload.message,
    payload.error,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim().slice(0, 300);
  }
  // No reason field: the status itself is the only signal we have.
  return status && status !== "SUCCESS" ? status : null;
}

export function readNotification(
  payload: Record<string, unknown>,
): DokuNotification {
  const order = (payload.order ?? {}) as Record<string, unknown>;
  const transaction = (payload.transaction ?? {}) as Record<string, unknown>;
  const channel = (payload.channel ?? {}) as Record<string, unknown>;
  const service = (payload.service ?? {}) as Record<string, unknown>;

  const status = String(transaction.status ?? "").toUpperCase();
  const rawAmount = order.amount;
  const amount = rawAmount === undefined ? null : Number(rawAmount);

  return {
    invoiceNumber: order.invoice_number ? String(order.invoice_number) : null,
    status,
    success: status === "SUCCESS",
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    channelCode: channel.id ? String(channel.id) : null,
    identifier: service.id ? String(service.id) : null,
    failureReason: readFailureReason(payload, transaction, status),
  };
}

// ─── Refunds ────────────────────────────────────────────────────────────────

/**
 * DOKU refunds are raised from the DOKU dashboard for the MVP. Returning null
 * signals the manual flow to lib/refund-gateway.ts rather than pretending a
 * refund was issued.
 */
export async function refundPayment(_args: {
  invoiceNumber: string;
  amount: number;
  reason: string;
}): Promise<{ id: string; status: string } | null> {
  return null;
}

/** Read-only diagnostic — no funds move. */
export function pingDoku(): {
  ok: boolean;
  mode: "live" | "sandbox" | "mock";
  clientIdPrefix: string;
  secretPresent: boolean;
  /** The console override applied, ENV when the env flag decides. */
  override: GatewayModeOverride;
} {
  const mode = !isDokuConfigured()
    ? "mock"
    : effectiveProduction()
      ? "live"
      : "sandbox";
  return {
    ok: isDokuConfigured(),
    mode,
    clientIdPrefix: env.DOKU_CLIENT_ID ? env.DOKU_CLIENT_ID.slice(0, 8) + "…" : "",
    secretPresent: Boolean(env.DOKU_SECRET_KEY),
    override: modeOverride,
  };
}
