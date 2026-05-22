/**
 * Payment Service Provider abstraction.
 * Routes to Mayar (preferred), Xendit, or Midtrans (credit card).
 */
import { createInvoice, isXenditConfigured } from "./xendit";
import { createSnapToken, isMidtransConfigured } from "./midtrans";
import {
  createInvoice as createMayarInvoice,
  isMayarConfigured,
} from "./mayar";

export type PSPProvider = "mayar" | "xendit" | "midtrans";

export type CreatePaymentArgs = {
  bookingReference: string;
  amount: number;
  payerEmail: string;
  payerName: string;
  payerPhone: string;
  description: string;
  successUrl: string;
  failureUrl: string;
  durationSeconds: number;
  /** Hint: 'CREDIT_CARD' routes to Midtrans if configured. */
  preferredMethod?: string;
};

export type CreatePaymentResult = {
  provider: PSPProvider;
  redirectUrl: string;
  gatewayReference: string;
  /** Midtrans Snap token (for embedded payment UI). */
  snapToken?: string;
};

export function selectPSP(preferredMethod?: string): PSPProvider {
  // Credit-card preference still routes to Midtrans (richer card UX)
  if (preferredMethod === "CREDIT_CARD" && isMidtransConfigured()) {
    return "midtrans";
  }
  if (isMayarConfigured()) return "mayar";
  if (isXenditConfigured()) return "xendit";
  if (isMidtransConfigured()) return "midtrans";
  throw new Error("No payment provider configured");
}

export async function createPayment(
  args: CreatePaymentArgs,
): Promise<CreatePaymentResult> {
  const provider = selectPSP(args.preferredMethod);

  if (provider === "mayar") {
    const expiresAt = new Date(Date.now() + args.durationSeconds * 1000);
    const invoice = await createMayarInvoice({
      externalId: args.bookingReference,
      amount: args.amount,
      payerEmail: args.payerEmail,
      payerName: args.payerName,
      payerPhone: args.payerPhone,
      description: args.description,
      successRedirectUrl: args.successUrl,
      expiresAt,
    });
    return {
      provider: "mayar",
      redirectUrl: invoice.invoiceUrl,
      gatewayReference: invoice.id,
    };
  }

  if (provider === "xendit") {
    const invoice = await createInvoice({
      externalId: args.bookingReference,
      amount: args.amount,
      payerEmail: args.payerEmail,
      description: args.description,
      successRedirectUrl: args.successUrl,
      failureRedirectUrl: args.failureUrl,
      invoiceDuration: args.durationSeconds,
    });
    return {
      provider: "xendit",
      redirectUrl: invoice.invoiceUrl,
      gatewayReference: invoice.id,
    };
  }

  // Midtrans
  const snap = await createSnapToken({
    orderId: args.bookingReference,
    amount: args.amount,
    customerName: args.payerName,
    customerEmail: args.payerEmail,
    customerPhone: args.payerPhone,
    description: args.description,
    finishUrl: args.successUrl,
  });
  return {
    provider: "midtrans",
    redirectUrl: snap.redirectUrl,
    gatewayReference: args.bookingReference,
    snapToken: snap.token,
  };
}

export function isAnyPSPConfigured(): boolean {
  return (
    isMayarConfigured() || isXenditConfigured() || isMidtransConfigured()
  );
}
