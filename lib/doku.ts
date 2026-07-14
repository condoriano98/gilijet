import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

/**
 * DOKU (Jokul) Checkout client — the sole payment gateway.
 *
 * We create one payment and redirect the customer to DOKU's hosted checkout
 * page, which handles every method (Virtual Account, QRIS, e-wallet, card 3DS).
 * DOKU confirms payment out-of-band via a signed notification (see
 * app/api/webhooks/doku/route.ts) and returns the customer to callback_url.
 *
 * MOCK MODE: when DOKU_CLIENT_ID / DOKU_SECRET_KEY are absent, or the secret
 * starts with "test_" / equals "mock", createDokuCheckout returns a URL to the
 * built-in /checkout demo flow. This keeps local dev and the e2e golden path
 * working without real keys.
 *
 * ⚠️ The endpoint path + response fields are per DOKU's Jokul Checkout docs;
 * confirm against your DOKU Back Office / Postman collection before going live —
 * the request signature is computed over the exact path, so a wrong path fails
 * auth. Marked `CONFIRM`.
 */

export class DokuNotConfiguredError extends Error {
  constructor() {
    super("DOKU_CLIENT_ID / DOKU_SECRET_KEY are not configured");
    this.name = "DokuNotConfiguredError";
  }
}

export function isDokuConfigured(): boolean {
  return Boolean(env.DOKU_CLIENT_ID && env.DOKU_SECRET_KEY);
}

/** True when we should short-circuit to the local mock checkout. */
export function isDokuMock(): boolean {
  const k = env.DOKU_SECRET_KEY;
  return !isDokuConfigured() || k === "mock" || Boolean(k?.startsWith("test_"));
}

function baseUrl(): string {
  return env.DOKU_IS_PRODUCTION
    ? "https://api.doku.com"
    : "https://api-sandbox.doku.com";
}

// ---------- endpoints (CONFIRM against DOKU docs) ----------

const PATH = {
  checkout: "/checkout/v1/payment", // Jokul Checkout — create payment (CONFIRM)
  refund: "/orders/v1/refund", // CONFIRM
} as const;

// ---------- signing ----------

function nowTimestamp(): string {
  // DOKU expects ISO-8601 UTC without milliseconds: 2026-07-13T08:45:42Z
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function digestOf(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("base64");
}

/**
 * Builds the DOKU HMAC-SHA256 signature header value for a request or verifies
 * a notification. `rawBody` omitted → no Digest line (GET requests).
 */
export function dokuSignature(opts: {
  clientId: string;
  requestId: string;
  timestamp: string;
  path: string;
  rawBody?: string;
  secretKey: string;
}): string {
  const lines = [
    `Client-Id:${opts.clientId}`,
    `Request-Id:${opts.requestId}`,
    `Request-Timestamp:${opts.timestamp}`,
    `Request-Target:${opts.path}`,
  ];
  if (opts.rawBody !== undefined) lines.push(`Digest:${digestOf(opts.rawBody)}`);
  const hmac = createHmac("sha256", opts.secretKey)
    .update(lines.join("\n"))
    .digest("base64");
  return `HMACSHA256=${hmac}`;
}

async function dokuPost<T>(path: string, bodyObj: unknown): Promise<T> {
  if (!isDokuConfigured()) throw new DokuNotConfiguredError();
  const rawBody = JSON.stringify(bodyObj);
  const requestId = randomUUID();
  const timestamp = nowTimestamp();
  const signature = dokuSignature({
    clientId: env.DOKU_CLIENT_ID!,
    requestId,
    timestamp,
    path,
    rawBody,
    secretKey: env.DOKU_SECRET_KEY!,
  });
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Id": env.DOKU_CLIENT_ID!,
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      Signature: signature,
    },
    body: rawBody,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`DOKU ${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// ---------- notification verification ----------

/**
 * Verify an inbound DOKU notification. Recomputes the signature over the
 * notification path + raw body and compares (timing-safe) against the
 * `Signature` header. Fail-closed when unconfigured.
 */
export function verifyDokuNotification(
  req: Request,
  rawBody: string,
  notificationPath: string,
): boolean {
  if (!isDokuConfigured()) return false;
  const provided = req.headers.get("signature");
  const clientId = req.headers.get("client-id");
  const requestId = req.headers.get("request-id");
  const timestamp = req.headers.get("request-timestamp");
  if (!provided || !clientId || !requestId || !timestamp) return false;
  const expected = dokuSignature({
    clientId,
    requestId,
    timestamp,
    path: notificationPath,
    rawBody,
    secretKey: env.DOKU_SECRET_KEY!,
  });
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------- checkout ----------

export type DokuCheckoutResult = {
  paymentUrl: string;
  tokenId: string;
  expiresAt: Date;
};

/** Best-effort extraction of a nested string field from DOKU's response. */
function pick(obj: unknown, ...paths: string[][]): string | null {
  for (const path of paths) {
    let cur: unknown = obj;
    for (const key of path) {
      if (cur && typeof cur === "object" && key in (cur as object)) {
        cur = (cur as Record<string, unknown>)[key];
      } else {
        cur = undefined;
        break;
      }
    }
    if (typeof cur === "string" && cur) return cur;
  }
  return null;
}

/**
 * Create a DOKU Checkout payment and return the hosted page URL to redirect to.
 * In mock mode, returns the built-in /checkout demo URL.
 */
export async function createDokuCheckout(args: {
  invoiceNumber: string;
  amount: number;
  customer: { name: string; email: string; phone: string };
  callbackUrl: string; // where DOKU returns the customer after payment
  failedUrl?: string;
  expiryMinutes: number;
  description?: string;
}): Promise<DokuCheckoutResult> {
  const expiresAt = new Date(Date.now() + args.expiryMinutes * 60_000);

  if (isDokuMock()) {
    return {
      paymentUrl: `/checkout/${args.invoiceNumber}`,
      tokenId: `mock_${args.invoiceNumber}`,
      expiresAt,
    };
  }

  const body = {
    order: {
      amount: args.amount,
      invoice_number: args.invoiceNumber,
      currency: "IDR",
      callback_url: args.callbackUrl,
      failed_url: args.failedUrl ?? args.callbackUrl,
      auto_redirect: true,
      line_items: [
        {
          name: (args.description ?? `Booking ${args.invoiceNumber}`).slice(0, 50),
          price: args.amount,
          quantity: 1,
        },
      ],
    },
    payment: { payment_due_date: args.expiryMinutes },
    customer: {
      id: args.customer.email,
      name: args.customer.name,
      email: args.customer.email,
      phone: args.customer.phone.replace(/[^\d]/g, ""),
      country: "ID",
    },
  };

  const res = await dokuPost<Record<string, unknown>>(PATH.checkout, body);
  const paymentUrl =
    pick(res, ["response", "payment", "url"], ["payment", "url"]) ?? "";
  const tokenId =
    pick(
      res,
      ["response", "payment", "token_id"],
      ["payment", "token_id"],
      ["response", "order", "invoice_number"],
    ) ?? args.invoiceNumber;
  if (!paymentUrl) throw new Error("DOKU Checkout: no payment.url in response");
  return { paymentUrl, tokenId, expiresAt };
}

// ---------- refunds ----------

export async function createRefund(params: {
  gatewayReference: string;
  amount: number;
  reason: string;
}): Promise<{ id: string; status: string }> {
  if (isDokuMock()) {
    return { id: `mock_refund_${params.gatewayReference}`, status: "PROCESSING" };
  }
  const res = await dokuPost<Record<string, unknown>>(PATH.refund, {
    refund: {
      original_invoice_number: params.gatewayReference,
      amount: params.amount,
      reason: params.reason.slice(0, 200),
    },
  });
  return {
    id: pick(res, ["refund", "id"], ["refund", "refund_id"]) ?? params.gatewayReference,
    status: pick(res, ["refund", "status"], ["transaction", "status"]) ?? "PENDING",
  };
}

/** Config/diagnostics summary (no funds move). */
export function pingDoku(): {
  ok: boolean;
  mode: "live" | "sandbox" | "mock";
  clientIdPrefix: string;
} {
  const mode = !isDokuConfigured()
    ? "mock"
    : env.DOKU_IS_PRODUCTION
      ? "live"
      : "sandbox";
  return {
    ok: isDokuConfigured(),
    mode,
    clientIdPrefix: env.DOKU_CLIENT_ID ? env.DOKU_CLIENT_ID.slice(0, 8) + "…" : "",
  };
}
