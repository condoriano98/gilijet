import { env } from "./env";

/**
 * Mayar REST wrapper for the payment flow.
 *
 * MOCK MODE: Set MAYAR_API_KEY to "test_anything" or "mock" to bypass the
 * real API and use local /checkout flow for testing. Useful while awaiting
 * API approval (~3 days).
 *
 *  - createInvoice : called when a customer submits a booking
 *  - createRefund  : called when a booking is cancelled
 *
 * If MAYAR_API_KEY is unset (local dev), all calls throw
 * MayarNotConfiguredError. The PSP layer catches this and falls back
 * to whatever other gateway is configured (or mock-pay).
 *
 * API docs: https://docs.mayar.id
 */

export class MayarNotConfiguredError extends Error {
  constructor() {
    super("MAYAR_API_KEY is not configured");
    this.name = "MayarNotConfiguredError";
  }
}

function baseUrl(): string {
  return env.MAYAR_IS_PRODUCTION
    ? "https://api.mayar.id/hl/v1"
    : "https://api.mayar.club/hl/v1";
}

function authHeader(): string {
  if (!env.MAYAR_API_KEY) throw new MayarNotConfiguredError();
  return `Bearer ${env.MAYAR_API_KEY}`;
}

async function mayarFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Mayar ${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ---------- invoices ----------

export type CreateInvoiceParams = {
  externalId: string; // our bookingReference (mapped → mobile/email reference)
  amount: number;
  payerEmail: string;
  payerName: string;
  payerPhone: string;
  description: string;
  successRedirectUrl: string;
  expiresAt?: Date;
};

export type CreateInvoiceResult = {
  id: string;
  invoiceUrl: string;
  expiresAt: string | null;
};

type MayarInvoiceResponse = {
  statusCode: number;
  messages: string;
  data: {
    id: string;
    transaction_id?: string;
    link?: string;
    paymentLink?: string;
    expiredAt?: string;
    expired_at?: string;
  };
};

export async function createInvoice(
  params: CreateInvoiceParams,
): Promise<CreateInvoiceResult> {
  // Mock mode for testing without API approval. Return a relative checkout URL
  // so it works on any domain without needing APP_BASE_URL set correctly.
  if (
    env.MAYAR_API_KEY?.startsWith("test_") ||
    env.MAYAR_API_KEY === "mock"
  ) {
    return {
      id: `mock_${params.externalId}`,
      invoiceUrl: `/checkout/${params.externalId}`,
      expiresAt: params.expiresAt?.toISOString() ?? null,
    };
  }

  // Mayar "Generate Invoice" endpoint. Field names follow Mayar's
  // Headless API: https://docs.mayar.id/api-reference/invoice/create
  const body = {
    name: params.payerName.slice(0, 100),
    email: params.payerEmail,
    mobile: params.payerPhone.replace(/[^\d+]/g, ""),
    description: params.description.slice(0, 200),
    redirectUrl: params.successRedirectUrl,
    expiredAt: params.expiresAt ? params.expiresAt.toISOString() : undefined,
    items: [
      {
        description: params.description.slice(0, 200),
        quantity: 1,
        rate: params.amount,
      },
    ],
  };
  const r = await mayarFetch<MayarInvoiceResponse>("/invoice/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const link = r.data.link ?? r.data.paymentLink ?? "";
  if (!link) {
    throw new Error(`Mayar /invoice/create: missing payment link in response`);
  }
  return {
    id: r.data.id ?? r.data.transaction_id ?? params.externalId,
    invoiceUrl: link,
    expiresAt: r.data.expiredAt ?? r.data.expired_at ?? null,
  };
}

// ---------- refunds ----------

export type CreateRefundParams = {
  transactionId: string; // Mayar transaction/invoice ID
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
  // Mock mode for testing without API approval
  if (
    env.MAYAR_API_KEY?.startsWith("test_") ||
    env.MAYAR_API_KEY === "mock"
  ) {
    return {
      id: `mock_refund_${params.transactionId}`,
      status: "PROCESSING",
    };
  }

  const r = await mayarFetch<{
    statusCode: number;
    messages: string;
    data: { id?: string; status?: string };
  }>("/refund/create", {
    method: "POST",
    body: JSON.stringify({
      transactionId: params.transactionId,
      amount: params.amount,
      reason: params.reason.slice(0, 200),
    }),
  });
  return {
    id: r.data.id ?? params.transactionId,
    status: r.data.status ?? "PENDING",
  };
}

/** True when we can talk to Mayar (i.e. customer-facing payment is real). */
export function isMayarConfigured(): boolean {
  return Boolean(env.MAYAR_API_KEY);
}
