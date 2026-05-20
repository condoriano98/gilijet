import { createHash } from "node:crypto";
import { env } from "./env";

export class MidtransNotConfiguredError extends Error {
  constructor() {
    super("MIDTRANS_SERVER_KEY is not configured");
    this.name = "MidtransNotConfiguredError";
  }
}

function midtransBase(): string {
  return env.MIDTRANS_IS_PRODUCTION
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

function authHeader(): string {
  if (!env.MIDTRANS_SERVER_KEY) throw new MidtransNotConfiguredError();
  return `Basic ${Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString("base64")}`;
}

export type SnapParams = {
  orderId: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  description: string;
  finishUrl: string;
};

export type SnapResult = {
  token: string;
  redirectUrl: string;
};

export async function createSnapToken(params: SnapParams): Promise<SnapResult> {
  const [first, ...rest] = params.customerName.split(" ");
  const res = await fetch(`${midtransBase()}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transaction_details: {
        order_id: params.orderId,
        gross_amount: params.amount,
      },
      customer_details: {
        first_name: first,
        last_name: rest.join(" ") || undefined,
        email: params.customerEmail,
        phone: params.customerPhone,
      },
      item_details: [
        {
          id: params.orderId,
          price: params.amount,
          quantity: 1,
          name: params.description.slice(0, 50),
        },
      ],
      callbacks: { finish: params.finishUrl },
    }),
  });
  const data = (await res.json()) as {
    token?: string;
    redirect_url?: string;
    error_messages?: string[];
  };
  if (!res.ok || !data.token) {
    throw new Error(
      `Midtrans Snap ${res.status}: ${data.error_messages?.join(", ") ?? "unknown"}`,
    );
  }
  return { token: data.token, redirectUrl: data.redirect_url! };
}

export function isMidtransConfigured(): boolean {
  return Boolean(env.MIDTRANS_SERVER_KEY);
}

/** Verifies Midtrans notification signature. */
export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  signatureKey: string,
): boolean {
  if (!env.MIDTRANS_SERVER_KEY) return false;
  const expected = createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${env.MIDTRANS_SERVER_KEY}`)
    .digest("hex");
  return expected === signatureKey;
}
