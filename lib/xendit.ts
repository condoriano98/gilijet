import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Thin Xendit wrapper. Implemented in Phase 2 (booking engine). For now we
 * expose the surface so other modules can import without breaking, and we
 * implement the webhook-signature check that Phase 2 will need on day one.
 */

export class XenditNotConfiguredError extends Error {
  constructor() {
    super("XENDIT_SECRET_KEY is not configured");
  }
}

function basicAuthHeader(): string {
  if (!env.XENDIT_SECRET_KEY) throw new XenditNotConfiguredError();
  const token = Buffer.from(`${env.XENDIT_SECRET_KEY}:`).toString("base64");
  return `Basic ${token}`;
}

export type CreateInvoiceParams = {
  externalId: string;
  amount: number; // IDR, integer
  payerEmail: string;
  description: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
  invoiceDuration?: number; // seconds
};

export type CreateInvoiceResult = {
  id: string;
  invoiceUrl: string;
  expiresAt: string;
};

/**
 * Stub for `POST /v2/invoices`. Phase 2 will turn this on. We keep the shape
 * here so callers can be written against it.
 */
export async function createInvoice(
  _params: CreateInvoiceParams,
): Promise<CreateInvoiceResult> {
  if (!env.XENDIT_SECRET_KEY) throw new XenditNotConfiguredError();
  void basicAuthHeader; // wired up in Phase 2
  throw new Error("createInvoice() not implemented yet (Phase 2)");
}

/**
 * Verify Xendit webhook signature. Xendit sends `x-callback-token` matching
 * our verification token (constant-time compared here).
 */
export function verifyWebhookToken(receivedToken: string | null): boolean {
  if (!env.XENDIT_WEBHOOK_VERIFICATION_TOKEN || !receivedToken) return false;
  const a = Buffer.from(env.XENDIT_WEBHOOK_VERIFICATION_TOKEN, "utf8");
  const b = Buffer.from(receivedToken, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Reserved for future HMAC-based callback signing. */
export function _hmacFingerprint(payload: string): string {
  if (!env.XENDIT_WEBHOOK_VERIFICATION_TOKEN) return "";
  return createHmac("sha256", env.XENDIT_WEBHOOK_VERIFICATION_TOKEN)
    .update(payload)
    .digest("hex");
}
