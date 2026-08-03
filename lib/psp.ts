/**
 * Payment orchestration — DOKU Checkout is the sole gateway.
 *
 * The booking flow goes: reserve → /pay/{ref} → "Continue to payment" →
 * DOKU hosted checkout page → customer picks a channel and pays →
 * DOKU notification confirms → tickets issued.
 *
 * This module exposes `startDokuCheckout` (called from the pay page) and
 * `normalizePaymentMethod` (used by the notification handler to map DOKU
 * channel ids onto our PaymentMethod enum).
 */
import { PaymentMethod, PaymentProvider } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import {
  createCheckout,
  isDokuConfigured,
  isDokuMock,
  type CreateCheckoutResult,
} from "./doku";

/** True when a real (non-mock) gateway is configured. */
export function isAnyPSPConfigured(): boolean {
  return isDokuConfigured() && !isDokuMock();
}

/**
 * Open a DOKU checkout for a booking.  Called from the pay page server action.
 * Persists the invoice number as the gateway reference so the notification can
 * correlate back to this booking later.
 */
export async function startDokuCheckout(
  bookingReference: string,
): Promise<CreateCheckoutResult> {
  const booking = await prisma.booking.findUnique({
    where: { bookingReference },
    include: { payment: true },
  });
  if (!booking) throw new Error("Booking not found");
  if (booking.status !== "PENDING_PAYMENT") {
    throw new Error("Booking is no longer awaiting payment");
  }

  const result = await createCheckout({
    orderId: booking.bookingReference,
    amount: Math.round(Number(booking.totalAmount)),
    payerName: booking.customerName,
    payerEmail: booking.customerEmail,
    payerPhone: booking.customerPhone,
    callbackUrl: `${env.APP_BASE_URL}/b/${booking.bookingReference}`,
    expiryMinutes: env.BOOKING_HOLD_MINUTES ?? 30,
  });

  await prisma.payment.update({
    where: { bookingId: booking.id },
    data: {
      method: "BANK_TRANSFER",
      status: "PENDING",
      gatewayProvider: PaymentProvider.DOKU,
      gatewayReference: result.invoiceNumber,
    },
  });
  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentGatewayRef: result.invoiceNumber },
  });

  return result;
}

/**
 * Normalise a DOKU channel id into a PaymentMethod enum.  Throws on unknown
 * values so new channels are never silently dropped.
 */
export function normalizePaymentMethod(raw: string): PaymentMethod {
  const upper = raw.toUpperCase();
  const mapping: Record<string, PaymentMethod> = {
    // canonical
    BANK_TRANSFER: PaymentMethod.BANK_TRANSFER,
    VA_BCA: PaymentMethod.VA_BCA,
    VA_BNI: PaymentMethod.VA_BNI,
    VA_BRI: PaymentMethod.VA_BRI,
    VA_MANDIRI: PaymentMethod.VA_MANDIRI,
    VA_PERMATA: PaymentMethod.VA_PERMATA,
    GOPAY: PaymentMethod.GOPAY,
    OVO: PaymentMethod.OVO,
    DANA: PaymentMethod.DANA,
    SHOPEEPAY: PaymentMethod.SHOPEEPAY,
    LINKAJA: PaymentMethod.LINKAJA,
    QRIS: PaymentMethod.QRIS,
    CREDIT_CARD: PaymentMethod.CREDIT_CARD,
    // DOKU channel ids. The virtual accounts below are the ones our enum names
    // individually; every other bank falls through to BANK_TRANSFER.
    VIRTUAL_ACCOUNT_BCA: PaymentMethod.VA_BCA,
    VIRTUAL_ACCOUNT_BNI: PaymentMethod.VA_BNI,
    VIRTUAL_ACCOUNT_BRI: PaymentMethod.VA_BRI,
    VIRTUAL_ACCOUNT_BANK_MANDIRI: PaymentMethod.VA_MANDIRI,
    VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI: PaymentMethod.VA_MANDIRI,
    VIRTUAL_ACCOUNT_BANK_PERMATA: PaymentMethod.VA_PERMATA,
    VIRTUAL_ACCOUNT_BANK_CIMB: PaymentMethod.VA_PERMATA,
    ONLINE_TO_OFFLINE_ALFA: PaymentMethod.BANK_TRANSFER,
    ONLINE_TO_OFFLINE_INDOMARET: PaymentMethod.BANK_TRANSFER,
    PEER_TO_PEER_AKULAKU: PaymentMethod.BANK_TRANSFER,
    EMONEY_OVO: PaymentMethod.OVO,
    EMONEY_DANA: PaymentMethod.DANA,
    EMONEY_SHOPEE_PAY: PaymentMethod.SHOPEEPAY,
    EMONEY_LINKAJA: PaymentMethod.LINKAJA,
    EMONEY_DOKU: PaymentMethod.BANK_TRANSFER,
    QRIS_DOKU: PaymentMethod.QRIS,
    CREDIT_CARD_DOKU: PaymentMethod.CREDIT_CARD,
    DOKU: PaymentMethod.BANK_TRANSFER,
    PENDING: PaymentMethod.BANK_TRANSFER,
  };
  if (mapping[upper]) return mapping[upper];

  // Channel-family prefixes are checked before brand substrings, because the
  // brands overlap: VIRTUAL_ACCOUNT_BANK_DANAMON contains "DANA" and would
  // otherwise be recorded as a DANA e-wallet payment rather than a transfer.
  if (upper.startsWith("VIRTUAL_ACCOUNT")) {
    if (upper.includes("BCA")) return PaymentMethod.VA_BCA;
    if (upper.includes("BNI")) return PaymentMethod.VA_BNI;
    if (upper.includes("BRI")) return PaymentMethod.VA_BRI;
    if (upper.includes("MANDIRI")) return PaymentMethod.VA_MANDIRI;
    if (upper.includes("PERMATA") || upper.includes("CIMB")) {
      return PaymentMethod.VA_PERMATA;
    }
    return PaymentMethod.BANK_TRANSFER;
  }
  if (upper.startsWith("ONLINE_TO_OFFLINE") || upper.startsWith("PEER_TO_PEER")) {
    return PaymentMethod.BANK_TRANSFER;
  }

  if (upper.includes("SHOPEE")) return PaymentMethod.SHOPEEPAY;
  if (upper.includes("GOPAY")) return PaymentMethod.GOPAY;
  if (upper.includes("OVO")) return PaymentMethod.OVO;
  if (upper.includes("DANA")) return PaymentMethod.DANA;
  if (upper.includes("LINKAJ")) return PaymentMethod.LINKAJA;
  if (upper.includes("QRIS")) return PaymentMethod.QRIS;
  if (upper.includes("CARD")) return PaymentMethod.CREDIT_CARD;
  if (upper.includes("ALFA") || upper.includes("INDOMARET")) {
    return PaymentMethod.BANK_TRANSFER;
  }
  throw new Error(`Unknown payment method: ${raw}`);
}
