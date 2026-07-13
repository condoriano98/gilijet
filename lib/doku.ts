import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { PaymentMethod } from "@prisma/client";
import { env } from "./env";

/**
 * DOKU (Jokul) Direct API client — the sole payment gateway.
 *
 * Direct API is server-to-server: we create a per-method payment instrument
 * (a Virtual Account number, a QRIS string, an e-wallet redirect, or a card
 * 3DS redirect) and render it ourselves. DOKU confirms payment out-of-band via
 * a signed notification (see app/api/webhooks/doku/route.ts).
 *
 * MOCK MODE: when DOKU_CLIENT_ID / DOKU_SECRET_KEY are absent, or the secret
 * starts with "test_" / equals "mock", every create call returns a MOCK
 * instrument that routes the customer to the built-in /checkout demo flow.
 * This keeps local dev and the e2e golden path working without real keys.
 *
 * ⚠️ ENDPOINT PATHS + RESPONSE FIELDS below are transcribed from DOKU's public
 * docs and MUST be confirmed against your DOKU Back Office / Postman collection
 * before going live — the request signature is computed over the exact path, so
 * a wrong path fails auth. Each is marked `CONFIRM`.
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
  va: "/doku-virtual-account/v2/payment-code", // CONFIRM
  qris: "/doku-qris/v1/generate", // CONFIRM
  ewallet: "/doku-ewallet/v1/payment", // CONFIRM (may be per-acquirer)
  card: "/credit-card/v1/payment", // CONFIRM (3DS)
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

// ---------- payment instruments ----------

export type DokuMethodChoice =
  | { kind: "QRIS" }
  | { kind: "VA"; bank: "BCA" | "BNI" | "BRI" | "MANDIRI" | "PERMATA" }
  | { kind: "EWALLET"; wallet: "OVO" | "DANA" | "SHOPEEPAY" | "LINKAJA" }
  | { kind: "CARD" };

export type DokuInstrument =
  | { type: "VA"; vaNumber: string; bank: string }
  | { type: "QRIS"; qrString: string }
  | { type: "REDIRECT"; url: string }
  | { type: "CARD_3DS"; redirectUrl: string }
  | { type: "MOCK"; url: string };

export type DokuPaymentResult = {
  gatewayReference: string;
  method: PaymentMethod;
  instrument: DokuInstrument;
  expiresAt: Date | null;
};

const VA_METHOD: Record<string, PaymentMethod> = {
  BCA: PaymentMethod.VA_BCA,
  BNI: PaymentMethod.VA_BNI,
  BRI: PaymentMethod.VA_BRI,
  MANDIRI: PaymentMethod.VA_MANDIRI,
  PERMATA: PaymentMethod.VA_PERMATA,
};
const EWALLET_METHOD: Record<string, PaymentMethod> = {
  OVO: PaymentMethod.OVO,
  DANA: PaymentMethod.DANA,
  SHOPEEPAY: PaymentMethod.SHOPEEPAY,
  LINKAJA: PaymentMethod.LINKAJA,
};

export function methodForChoice(choice: DokuMethodChoice): PaymentMethod {
  switch (choice.kind) {
    case "QRIS":
      return PaymentMethod.QRIS;
    case "VA":
      return VA_METHOD[choice.bank];
    case "EWALLET":
      return EWALLET_METHOD[choice.wallet];
    case "CARD":
      return PaymentMethod.CREDIT_CARD;
  }
}

type CreateArgs = {
  invoiceNumber: string;
  amount: number;
  customer: { name: string; email: string; phone: string };
  choice: DokuMethodChoice;
  callbackUrl: string;
  expiryMinutes: number;
};

/** Best-effort extraction of a field from DOKU's nested response. */
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
 * Create a DOKU payment instrument for the customer's chosen method.
 * Returns the instrument to render (or a MOCK instrument in mock mode).
 */
export async function createDokuPayment(
  args: CreateArgs,
): Promise<DokuPaymentResult> {
  const method = methodForChoice(args.choice);
  const expiresAt = new Date(Date.now() + args.expiryMinutes * 60_000);

  if (isDokuMock()) {
    return {
      gatewayReference: `mock_${args.invoiceNumber}`,
      method,
      instrument: { type: "MOCK", url: `/checkout/${args.invoiceNumber}` },
      expiresAt,
    };
  }

  const order = {
    invoice_number: args.invoiceNumber,
    amount: args.amount,
    callback_url: args.callbackUrl,
  };
  const customer = {
    id: args.customer.email,
    name: args.customer.name,
    email: args.customer.email,
    phone: args.customer.phone.replace(/[^\d]/g, ""),
    country: "ID",
  };

  // NOTE: request/response shapes below follow DOKU's documented Direct API;
  // confirm exact field names against Back Office / Postman.
  if (args.choice.kind === "VA") {
    const res = await dokuPost<Record<string, unknown>>(PATH.va, {
      order,
      customer,
      virtual_account_info: {
        billing_type: "FIX_BILL",
        expired_time: args.expiryMinutes,
        reusable_status: false,
        acquirer: args.choice.bank,
      },
    });
    const vaNumber =
      pick(
        res,
        ["virtual_account_info", "virtual_account_number"],
        ["virtual_account_info", "virtual_account_no"],
      ) ?? "";
    if (!vaNumber) throw new Error("DOKU VA: no virtual_account_number in response");
    return {
      gatewayReference: args.invoiceNumber,
      method,
      instrument: { type: "VA", vaNumber, bank: args.choice.bank },
      expiresAt,
    };
  }

  if (args.choice.kind === "QRIS") {
    const res = await dokuPost<Record<string, unknown>>(PATH.qris, {
      order,
      customer,
      qris: { expired_time: args.expiryMinutes },
    });
    const qrString =
      pick(res, ["qris", "qr_content"], ["qris", "qr_string"], ["qris", "qr_code"]) ?? "";
    if (!qrString) throw new Error("DOKU QRIS: no qr content in response");
    return {
      gatewayReference: args.invoiceNumber,
      method,
      instrument: { type: "QRIS", qrString },
      expiresAt,
    };
  }

  if (args.choice.kind === "EWALLET") {
    const res = await dokuPost<Record<string, unknown>>(PATH.ewallet, {
      order,
      customer,
      payment: { payment_due_date: args.expiryMinutes },
      additional_info: { channel: args.choice.wallet },
    });
    const url =
      pick(res, ["ewallet", "checkout_url"], ["payment", "url"], ["response", "payment", "url"]) ?? "";
    if (!url) throw new Error("DOKU e-wallet: no checkout_url in response");
    return {
      gatewayReference: args.invoiceNumber,
      method,
      instrument: { type: "REDIRECT", url },
      expiresAt,
    };
  }

  // CARD (3DS) — DOKU returns a hosted 3DS/payment URL to redirect to.
  const res = await dokuPost<Record<string, unknown>>(PATH.card, {
    order,
    customer,
    payment: { payment_due_date: args.expiryMinutes },
  });
  const redirectUrl =
    pick(res, ["payment", "url"], ["response", "payment", "url"]) ?? "";
  if (!redirectUrl) throw new Error("DOKU card: no payment url in response");
  return {
    gatewayReference: args.invoiceNumber,
    method,
    instrument: { type: "CARD_3DS", redirectUrl },
    expiresAt,
  };
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
