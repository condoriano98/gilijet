import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Xendit REST wrapper for the payment flow.
 *
 *  - createInvoice : called when a customer submits a booking
 *  - createRefund  : called when a booking is cancelled (customer or operator)
 *  - verifyWebhookToken : guards POST /api/webhooks/xendit
 *
 * If XENDIT_SECRET_KEY is unset (local dev, demos), all calls throw
 * XenditNotConfiguredError. Routes catch this and fall back to a mock-pay
 * code path that lets the rest of the flow be exercised end-to-end.
 */

export class XenditNotConfiguredError extends Error {
  constructor() {
    super("XENDIT_SECRET_KEY is not configured");
    this.name = "XenditNotConfiguredError";
  }
}

const XENDIT_BASE = "https://api.xendit.co";

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

export type CreateInvoiceParams = {
  externalId: string; // our bookingReference
  amount: number; // integer IDR
  payerEmail: string;
  description: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
  invoiceDuration?: number; // seconds (default 30 min)
};

export type CreateInvoiceResult = {
  id: string;
  invoiceUrl: string;
  expiresAt: string;
};

export async function createInvoice(
  params: CreateInvoiceParams,
): Promise<CreateInvoiceResult> {
  const body = {
    external_id: params.externalId,
    amount: params.amount,
    payer_email: params.payerEmail,
    description: params.description.slice(0, 200),
    success_redirect_url: params.successRedirectUrl,
    failure_redirect_url: params.failureRedirectUrl,
    invoice_duration: params.invoiceDuration ?? 1800,
    currency: "IDR",
  };
  const r = await xenditFetch<{
    id: string;
    invoice_url: string;
    expiry_date: string;
  }>("/v2/invoices", { method: "POST", body: JSON.stringify(body) });
  return { id: r.id, invoiceUrl: r.invoice_url, expiresAt: r.expiry_date };
}

// ---------- refunds ----------

export type CreateRefundParams = {
  invoiceId: string; // Xendit invoice ID
  amount: number; // integer IDR
  reason: string;
};

export type CreateRefundResult = {
  id: string;
  status: string;
};

export async function createRefund(
  params: CreateRefundParams,
): Promise<CreateRefundResult> {
  const r = await xenditFetch<{ id: string; status: string }>("/refunds", {
    method: "POST",
    body: JSON.stringify({
      invoice_id: params.invoiceId,
      amount: params.amount,
      reason: params.reason,
    }),
  });
  return { id: r.id, status: r.status };
}

// ---------- webhook verification ----------

export function verifyWebhookToken(receivedToken: string | null): boolean {
  if (!env.XENDIT_WEBHOOK_VERIFICATION_TOKEN || !receivedToken) return false;
  const a = Buffer.from(env.XENDIT_WEBHOOK_VERIFICATION_TOKEN, "utf8");
  const b = Buffer.from(receivedToken, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function _hmacFingerprint(payload: string): string {
  if (!env.XENDIT_WEBHOOK_VERIFICATION_TOKEN) return "";
  return createHmac("sha256", env.XENDIT_WEBHOOK_VERIFICATION_TOKEN)
    .update(payload)
    .digest("hex");
}

/** True when we can talk to Xendit (i.e. customer-facing payment is real). */
export function isXenditConfigured(): boolean {
  return Boolean(env.XENDIT_SECRET_KEY);
}
