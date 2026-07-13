/**
 * Payment orchestration — DOKU is the sole gateway.
 *
 * Unlike the old hosted-invoice flow, DOKU Direct creates a per-method
 * instrument when the customer picks a method on the pay page, so this module
 * exposes `createDokuInstrument` (called from the pay-page server action) plus
 * `normalizePaymentMethod` (used by the webhook to map DOKU channel ids to our
 * PaymentMethod enum).
 */
import { PaymentMethod, PaymentProvider } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import {
  createDokuPayment,
  isDokuConfigured,
  isDokuMock,
  type DokuMethodChoice,
  type DokuInstrument,
} from "./doku";

/** True when a real (non-mock) DOKU gateway is configured. */
export function isAnyPSPConfigured(): boolean {
  return isDokuConfigured() && !isDokuMock();
}

export type CreateInstrumentResult = {
  instrument: DokuInstrument;
  bookingReference: string;
};

/**
 * Create a DOKU payment instrument for a booking + chosen method and persist
 * it on the Payment row. Returns the instrument for the pay page to render or
 * redirect to.
 */
export async function createDokuInstrument(
  bookingId: string,
  choice: DokuMethodChoice,
): Promise<CreateInstrumentResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });
  if (!booking) throw new Error("Booking not found");
  if (booking.status !== "PENDING_PAYMENT") {
    throw new Error("Booking is no longer awaiting payment");
  }

  const result = await createDokuPayment({
    invoiceNumber: booking.bookingReference,
    amount: Math.round(Number(booking.totalAmount)),
    customer: {
      name: booking.customerName,
      email: booking.customerEmail,
      phone: booking.customerPhone,
    },
    choice,
    callbackUrl: `${env.APP_BASE_URL}/b/${booking.bookingReference}`,
    expiryMinutes: env.BOOKING_HOLD_MINUTES ?? 30,
  });

  await prisma.payment.update({
    where: { bookingId: booking.id },
    data: {
      method: result.method,
      status: "PENDING",
      gatewayProvider: PaymentProvider.DOKU,
      gatewayReference: result.gatewayReference,
      instrumentData: result.instrument as never,
      expiresAt: result.expiresAt,
    },
  });
  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentGatewayRef: result.gatewayReference },
  });

  return { instrument: result.instrument, bookingReference: booking.bookingReference };
}

/**
 * Normalise a raw payment method / channel id from a DOKU notification into a
 * PaymentMethod enum. Throws on unknown values so new channels are never
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
    // DOKU channel ids
    VIRTUAL_ACCOUNT_BCA: PaymentMethod.VA_BCA,
    VIRTUAL_ACCOUNT_BNI: PaymentMethod.VA_BNI,
    VIRTUAL_ACCOUNT_BRI: PaymentMethod.VA_BRI,
    VIRTUAL_ACCOUNT_BANK_MANDIRI: PaymentMethod.VA_MANDIRI,
    VIRTUAL_ACCOUNT_BANK_PERMATA: PaymentMethod.VA_PERMATA,
    VIRTUAL_ACCOUNT_DOKU: PaymentMethod.BANK_TRANSFER,
    EMONEY_OVO: PaymentMethod.OVO,
    EMONEY_DANA: PaymentMethod.DANA,
    EMONEY_SHOPEE_PAY: PaymentMethod.SHOPEEPAY,
    EMONEY_SHOPEEPAY: PaymentMethod.SHOPEEPAY,
    EMONEY_LINKAJA: PaymentMethod.LINKAJA,
    QRIS_DOKU: PaymentMethod.QRIS,
    DOKU: PaymentMethod.BANK_TRANSFER,
    PENDING: PaymentMethod.BANK_TRANSFER,
  };
  if (mapping[upper]) return mapping[upper];
  // Tolerant fallbacks for compound channel ids
  if (upper.includes("SHOPEE")) return PaymentMethod.SHOPEEPAY;
  if (upper.includes("OVO")) return PaymentMethod.OVO;
  if (upper.includes("DANA")) return PaymentMethod.DANA;
  if (upper.includes("LINKAJA")) return PaymentMethod.LINKAJA;
  if (upper.includes("QRIS")) return PaymentMethod.QRIS;
  if (upper.includes("BCA")) return PaymentMethod.VA_BCA;
  if (upper.includes("BNI")) return PaymentMethod.VA_BNI;
  if (upper.includes("BRI")) return PaymentMethod.VA_BRI;
  if (upper.includes("MANDIRI")) return PaymentMethod.VA_MANDIRI;
  if (upper.includes("PERMATA")) return PaymentMethod.VA_PERMATA;
  if (upper.includes("CARD")) return PaymentMethod.CREDIT_CARD;
  throw new Error(`Unknown payment method: ${raw}`);
}
