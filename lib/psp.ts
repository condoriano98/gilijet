/**
 * Payment Service Provider abstraction.
 * Routes to Mayar (preferred), Xendit, or Midtrans (credit card).
 */
import { PaymentProvider, PaymentMethod } from "@prisma/client";
import { createInvoice, isXenditConfigured } from "./xendit";
import { createSnapToken, isMidtransConfigured } from "./midtrans";
import {
  createInvoice as createMayarInvoice,
  isMayarConfigured,
} from "./mayar";

import { env } from "./env";

export type PSPProvider = PaymentProvider;

function isMayarReal(): boolean {
  return (
    isMayarConfigured() &&
    env.MAYAR_API_KEY !== "mock" &&
    !env.MAYAR_API_KEY?.startsWith("test_")
  );
}

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
  preferredMethod?: string;
};

export type CreatePaymentResult = {
  provider: PSPProvider;
  redirectUrl: string;
  gatewayReference: string;
  snapToken?: string;
};

export function selectPSP(preferredMethod?: string): PSPProvider {
  if (preferredMethod === "CREDIT_CARD" && isMidtransConfigured()) {
    return PaymentProvider.MIDTRANS;
  }
  if (isMayarReal()) return PaymentProvider.MAYAR;
  if (isXenditConfigured()) return PaymentProvider.XENDIT;
  if (isMidtransConfigured()) return PaymentProvider.MIDTRANS;
  if (isMayarConfigured()) return PaymentProvider.MAYAR;
  throw new Error("No payment provider configured");
}

export async function createPayment(
  args: CreatePaymentArgs,
): Promise<CreatePaymentResult> {
  const provider = selectPSP(args.preferredMethod);

  if (provider === PaymentProvider.MAYAR) {
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
      provider: PaymentProvider.MAYAR,
      redirectUrl: invoice.invoiceUrl,
      gatewayReference: invoice.id,
    };
  }

  if (provider === PaymentProvider.XENDIT) {
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
      provider: PaymentProvider.XENDIT,
      redirectUrl: invoice.invoiceUrl,
      gatewayReference: invoice.id,
    };
  }

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
    provider: PaymentProvider.MIDTRANS,
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

/**
 * Normalise a raw payment method string from a gateway webhook into a
 * PaymentMethod enum. Throws on unknown values so new methods are
 * never silently dropped.
 */
export function normalizePaymentMethod(raw: string): PaymentMethod {
  const upper = raw.toUpperCase();
  const mapping: Record<string, PaymentMethod> = {
    BANK_TRANSFER: PaymentMethod.BANK_TRANSFER,
    VA_BCA: PaymentMethod.VA_BCA,
    VA_BNI: PaymentMethod.VA_BNI,
    VA_BRI: PaymentMethod.VA_BRI,
    VA_MANDIRI: PaymentMethod.VA_MANDIRI,
    VA_PERMATA: PaymentMethod.VA_PERMATA,
    BCA: PaymentMethod.VA_BCA,
    BNI: PaymentMethod.VA_BNI,
    BRI: PaymentMethod.VA_BRI,
    MANDIRI: PaymentMethod.VA_MANDIRI,
    PERMATA: PaymentMethod.VA_PERMATA,
    GOPAY: PaymentMethod.GOPAY,
    OVO: PaymentMethod.OVO,
    DANA: PaymentMethod.DANA,
    SHOPEEPAY: PaymentMethod.SHOPEEPAY,
    LINKAJA: PaymentMethod.LINKAJA,
    QRIS: PaymentMethod.QRIS,
    CREDIT_CARD: PaymentMethod.CREDIT_CARD,
    MAYAR: PaymentMethod.BANK_TRANSFER,
    MAYAR_INVOICE: PaymentMethod.BANK_TRANSFER,
    MIDTRANS: PaymentMethod.BANK_TRANSFER,
    MIDTRANS_SNAP: PaymentMethod.CREDIT_CARD,
    XENDIT_INVOICE: PaymentMethod.BANK_TRANSFER,
    PENDING: PaymentMethod.BANK_TRANSFER,
  };
  if (mapping[upper]) return mapping[upper];
  throw new Error(`Unknown payment method: ${raw}`);
}
