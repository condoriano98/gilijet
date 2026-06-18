import { env } from "./env";

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("STRIPE_SECRET_KEY is not configured");
    this.name = "StripeNotConfiguredError";
  }
}

const STRIPE_BASE = "https://api.stripe.com/v1";

function authHeader(): string {
  if (!env.STRIPE_SECRET_KEY) throw new StripeNotConfiguredError();
  return `Bearer ${env.STRIPE_SECRET_KEY}`;
}

async function stripeFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Stripe ${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as T;
}

export type CreateInvoiceParams = {
  externalId: string;
  amount: number;
  payerEmail: string;
  description: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
};

export type CreateInvoiceResult = {
  id: string;
  invoiceUrl: string;
  expiresAt: string | null;
};

export async function createInvoice(
  params: CreateInvoiceParams,
): Promise<CreateInvoiceResult> {
  const session = await stripeFetch<{
    id: string;
    url: string;
    expires_at: number | null;
  }>("/checkout/sessions", {
    method: "POST",
    body: new URLSearchParams({
      mode: "payment",
      success_url: params.successRedirectUrl,
      cancel_url: params.failureRedirectUrl,
      customer_email: params.payerEmail,
      client_reference_id: params.externalId,
      "line_items[0][price_data][currency]": "idr",
      "line_items[0][price_data][unit_amount]": String(params.amount),
      "line_items[0][price_data][product_data][name]": params.description.slice(0, 200),
      "line_items[0][quantity]": "1",
      "payment_method_types[0]": "card",
    }).toString(),
  });
  return {
    id: session.id,
    invoiceUrl: session.url,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
  };
}

export type CreateRefundParams = {
  paymentIntentId: string;
  amount: number;
  reason: string;
};

export type CreateRefundResult = {
  id: string;
  status: string;
};

export async function createRefund(
  params: CreateRefundParams,
): Promise<CreateRefundResult> {
  const r = await stripeFetch<{ id: string; status: string }>("/refunds", {
    method: "POST",
    body: new URLSearchParams({
      payment_intent: params.paymentIntentId,
      amount: String(params.amount),
      reason: "requested_by_customer",
    }).toString(),
  });
  return { id: r.id, status: r.status };
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
): Record<string, unknown> | null {
  if (!env.STRIPE_WEBHOOK_SECRET) return null;
  const parts = signature.split(",").reduce<Record<string, string>>((acc, part) => {
    const [key, val] = part.split("=");
    if (key && val) acc[key.trim()] = val.trim();
    return acc;
  }, {});
  const timestamp = parts["t"];
  const sig = parts["v1"];
  if (!timestamp || !sig) return null;

  const signedPayload = `${timestamp}.${payload}`;
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const expected = crypto
    .createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest("hex");

  if (expected !== sig) return null;

  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}
