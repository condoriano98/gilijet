/**
 * Payment orchestration — Midtrans Snap is the sole gateway.
 *
 * The booking flow goes: reserve → /pay/{ref} → click "Pay" →
 * Midtrans Snap popup opens → customer pays inside popup →
 * Midtrans webhook confirms → tickets issued.
 *
 * This module exposes `generateSnapToken` (called from the pay page)
 * and `normalizePaymentMethod` (used by the webhook to map Midtrans
 * payment_type strings to our PaymentMethod enum).
 */
import { PaymentMethod, PaymentProvider } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import {
  createSnapTransaction,
  isMidtransConfigured,
  isMidtransMock,
  type CreateSnapResult,
} from "./midtrans";

/** True when a real (non-mock) Midtrans gateway is configured. */
export function isAnyPSPConfigured(): boolean {
  return isMidtransConfigured() && !isMidtransMock();
}

/**
 * Generate a Midtrans Snap token for a booking.  Called from the pay page
 * server action.  Persists the gateway reference on the Payment row so
 * the webhook can correlate the notification later.
 */
export async function generateSnapToken(
  bookingReference: string,
): Promise<CreateSnapResult> {
  const booking = await prisma.booking.findUnique({
    where: { bookingReference },
    include: { payment: true },
  });
  if (!booking) throw new Error("Booking not found");
  if (booking.status !== "PENDING_PAYMENT") {
    throw new Error("Booking is no longer awaiting payment");
  }

  const result = await createSnapTransaction({
    orderId: booking.bookingReference,
    amount: Math.round(Number(booking.totalAmount)),
    payerName: booking.customerName,
    payerEmail: booking.customerEmail,
    payerPhone: booking.customerPhone,
    finishUrl: `${env.APP_BASE_URL}/b/${booking.bookingReference}`,
    expiryMinutes: env.BOOKING_HOLD_MINUTES ?? 30,
  });

  await prisma.payment.update({
    where: { bookingId: booking.id },
    data: {
      method: "BANK_TRANSFER",
      status: "PENDING",
      gatewayProvider: PaymentProvider.MIDTRANS,
      gatewayReference: result.token,
    },
  });
  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentGatewayRef: result.token },
  });

  return result;
}

/**
 * Normalise a raw payment_type string from a Midtrans notification into a
 * PaymentMethod enum.  Throws on unknown values so new channels are never
 * silently dropped.
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
    // Midtrans payment_type values
    BCA: PaymentMethod.VA_BCA,
    BNI: PaymentMethod.VA_BNI,
    BRI: PaymentMethod.VA_BRI,
    MANDIRI: PaymentMethod.VA_MANDIRI,
    PERMATA: PaymentMethod.VA_PERMATA,
    CIMB: PaymentMethod.VA_PERMATA,
    BCA_VA: PaymentMethod.VA_BCA,
    BNI_VA: PaymentMethod.VA_BNI,
    BRI_VA: PaymentMethod.VA_BRI,
    MANDIRI_VA: PaymentMethod.VA_MANDIRI,
    PERMATA_VA: PaymentMethod.VA_PERMATA,
    ECHANNEL: PaymentMethod.VA_MANDIRI,
    CREDIT_CARD_MIDTRANS: PaymentMethod.CREDIT_CARD,
    GOPAY_MIDTRANS: PaymentMethod.GOPAY,
    SHOPEEPAY_MIDTRANS: PaymentMethod.SHOPEEPAY,
    QRIS_MIDTRANS: PaymentMethod.QRIS,
    CSHOP: PaymentMethod.BANK_TRANSFER,
    CSTORE: PaymentMethod.BANK_TRANSFER,
    MIDTRANS: PaymentMethod.BANK_TRANSFER,
    MIDTRANS_SNAP: PaymentMethod.CREDIT_CARD,
    PENDING: PaymentMethod.BANK_TRANSFER,
  };
  if (mapping[upper]) return mapping[upper];
  // Tolerant fallbacks for compound channel ids
  if (upper.includes("SHOPEE")) return PaymentMethod.SHOPEEPAY;
  if (upper.includes("GOPAY")) return PaymentMethod.GOPAY;
  if (upper.includes("OVO")) return PaymentMethod.OVO;
  if (upper.includes("DANA")) return PaymentMethod.DANA;
  if (upper.includes("LINKAJ")) return PaymentMethod.LINKAJA;
  if (upper.includes("QRIS")) return PaymentMethod.QRIS;
  if (upper.includes("BCA")) return PaymentMethod.VA_BCA;
  if (upper.includes("BNI")) return PaymentMethod.VA_BNI;
  if (upper.includes("BRI")) return PaymentMethod.VA_BRI;
  if (upper.includes("MANDIRI")) return PaymentMethod.VA_MANDIRI;
  if (upper.includes("PERMATA") || upper.includes("CIMB")) return PaymentMethod.VA_PERMATA;
  if (upper.includes("CARD")) return PaymentMethod.CREDIT_CARD;
  if (upper.includes("CSTORE") || upper.includes("CSHOP")) return PaymentMethod.BANK_TRANSFER;
  throw new Error(`Unknown payment method: ${raw}`);
}
