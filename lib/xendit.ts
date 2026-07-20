import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Xendit Invoice API client — the sole payment gateway.
 *
 * We create a Xendit invoice and redirect the customer to its hosted
 * `invoice_url`, which handles every method (Virtual Account, QRIS, e-wallet,
 * card, retail outlet). Xendit confirms payment out-of-band via a webhook (see
 * app/api/webhooks/xendit/route.ts) and returns the customer to the redirect URL.
 *
 * MOCK MODE: when XENDIT_SECRET_KEY is absent, or equals "mock" / starts with
 * "test_", createXenditInvoice returns a URL to the built-in /checkout demo
 * flow. This keeps local dev and the e2e golden path working without keys.
 */

export class XenditNotConfiguredError extends Error {
  constructor() {
    super("XENDIT_SECRET_KEY is not configured");
    this.name = "XenditNotConfiguredError";
  }
}

const XENDIT_BASE = "https://api.xendit.co";

export function isXenditConfigured(): boolean {
  return Boolean(env.XENDIT_SECRET_KEY);
}

/** True when we should short-circuit to the local mock checkout. */
export function isXenditMock(): boolean {
  const k = env.XENDIT_SECRET_KEY;
  return !isXenditConfigured() || k === "mock" || Boolean(k?.startsWith("test_"));
}

function authHeader(): string {
  if (!env.XENDIT_SECRET_KEY) throw new XenditNotConfiguredError();
  return `Basic ${Buffer.from(`${env.XENDIT_SECRET_KEY}:`).toString("base64")}`;
}

async function xenditFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${XENDIT_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Xendit ${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ---------- invoices ----------

export type XenditInvoiceResult = {
  paymentUrl: string;
  invoiceId: string;
  expiresAt: Date;
};

/**
 * Create a Xendit invoice and return the hosted page URL to redirect to.
 * In mock mode, returns the built-in /checkout demo URL.
 */
export async function createXenditInvoice(args: {
  invoiceNumber: string; // our bookingReference
  amount: number; // integer IDR
  customer: { name: string; email: string; phone: string };
  callbackUrl: string; // where Xendit returns the customer after payment
  failedUrl?: string;
  expiryMinutes: number;
  description?: string;
}): Promise<XenditInvoiceResult> {
  const expiresAt = new Date(Date.now() + args.expiryMinutes * 60_000);

  if (isXenditMock()) {
    return {
      paymentUrl: `/checkout/${args.invoiceNumber}`,
      invoiceId: `mock_${args.invoiceNumber}`,
      expiresAt,
    };
  }

  const body = {
    external_id: args.invoiceNumber,
    amount: args.amount,
    payer_email: args.customer.email,
    description: (args.description ?? `Gilibali booking ${args.invoiceNumber}`).slice(0, 200),
    success_redirect_url: args.callbackUrl,
    failure_redirect_url: args.failedUrl ?? args.callbackUrl,
    invoice_duration: args.expiryMinutes * 60, // seconds
    currency: "IDR",
    customer: {
      given_names: args.customer.name,
      email: args.customer.email,
      mobile_number: args.customer.phone,
    },
  };
  const r = await xenditFetch<{
    id: string;
    invoice_url: string;
    expiry_date?: string;
  }>("/v2/invoices", { method: "POST", body: JSON.stringify(body) });
  if (!r.invoice_url) throw new Error("Xendit: no invoice_url in response");
  return {
    paymentUrl: r.invoice_url,
    invoiceId: r.id,
    expiresAt: r.expiry_date ? new Date(r.expiry_date) : expiresAt,
  };
}

// ---------- refunds ----------

export async function createRefund(params: {
  invoiceId: string;
  amount: number;
  reason: string;
}): Promise<{ id: string; status: string }> {
  if (isXenditMock()) {
    return { id: `mock_refund_${params.invoiceId}`, status: "PENDING" };
  }
  const r = await xenditFetch<{ id: string; status: string }>("/refunds", {
    method: "POST",
    body: JSON.stringify({
      invoice_id: params.invoiceId,
      amount: params.amount,
      reason: "REQUESTED_BY_CUSTOMER",
    }),
  });
  return { id: r.id, status: r.status };
}

// ---------- webhook verification ----------

/** Verify the x-callback-token header on an inbound Xendit webhook. */
export function verifyWebhookToken(receivedToken: string | null): boolean {
  if (!env.XENDIT_WEBHOOK_VERIFICATION_TOKEN || !receivedToken) return false;
  const a = Buffer.from(env.XENDIT_WEBHOOK_VERIFICATION_TOKEN, "utf8");
  const b = Buffer.from(receivedToken, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Config/diagnostics summary (no funds move). */
export function pingXendit(): {
  ok: boolean;
  mode: "live" | "test" | "mock";
  keyPrefix: string;
} {
  const key = env.XENDIT_SECRET_KEY ?? "";
  const mode = !isXenditConfigured()
    ? "mock"
    : key.includes("development") || key.startsWith("test_")
      ? "test"
      : "live";
  return {
    ok: isXenditConfigured(),
    mode,
    keyPrefix: key ? key.slice(0, 12) + "…" : "",
  };
}
