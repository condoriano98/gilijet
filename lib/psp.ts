/**
 * Payment orchestration across the two gateways.
 *
 * Midtrans Snap covers domestic rails: reserve → /pay/{ref} → "Pay" →
 * Snap popup → webhook confirms → tickets issued.
 *
 * PayPal covers foreign cards on the same page. It charges a foreign
 * presentment amount because PayPal cannot settle IDR, and it captures
 * server-side on return rather than trusting the webhook to arrive first.
 *
 * Both paths converge on `confirmPaymentAndIssueTickets` in ./ticket-issuer,
 * so ticketing, seat finalisation and confirmation email stay identical.
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
import {
  captureOrder,
  createOrder,
  isPaypalLive,
  paypalPresentmentCurrency,
  type CaptureResult,
} from "./paypal";
import { quoteForeignCharge, type ForeignChargeQuote } from "./fx";
import { confirmPaymentAndIssueTickets } from "./ticket-issuer";

/** True when at least one real (non-mock) gateway can take money. */
export function isAnyPSPConfigured(): boolean {
  return (isMidtransConfigured() && !isMidtransMock()) || isPaypalLive();
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

// ─── PayPal ─────────────────────────────────────────────────────────────────

export type PaypalOrderResult = {
  orderId: string;
  quote: ForeignChargeQuote;
  /** Where to send the customer to approve the payment. */
  approveUrl: string | null;
};

/**
 * Quote the booking in the presentment currency and open a PayPal order.
 *
 * Propagates `FxRateUnavailableError` when no fresh rate exists. Callers must
 * treat that as "PayPal is unavailable" and fall back to Midtrans — charging a
 * guessed rate is worse than not offering the option.
 */
export async function startPaypalOrder(
  bookingReference: string,
): Promise<PaypalOrderResult> {
  const booking = await prisma.booking.findUnique({
    where: { bookingReference },
    include: {
      payment: true,
      leg: { include: { schedule: true } },
    },
  });
  if (!booking) throw new Error("Booking not found");
  if (booking.status !== "PENDING_PAYMENT") {
    throw new Error("Booking is no longer awaiting payment");
  }

  const currency = paypalPresentmentCurrency();
  const quote = await quoteForeignCharge(Number(booking.totalAmount), currency);

  const order = await createOrder({
    orderId: booking.bookingReference,
    amount: quote.amount,
    currency: quote.currency,
    description: `Gilijet ${booking.leg.schedule.originPort} → ${booking.leg.schedule.destinationPort}`,
    returnUrl: `${env.APP_BASE_URL}/pay/${booking.bookingReference}?paypal=return`,
    cancelUrl: `${env.APP_BASE_URL}/pay/${booking.bookingReference}?paypal=cancel`,
  });

  await prisma.payment.update({
    where: { bookingId: booking.id },
    data: {
      method: PaymentMethod.PAYPAL,
      status: "PENDING",
      gatewayProvider: PaymentProvider.PAYPAL,
      gatewayReference: order.id,
      presentmentCurrency: quote.currency,
      presentmentAmount: quote.amount,
      fxRate: quote.rate,
      fxQuotedAt: quote.quotedAt,
    },
  });
  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentGatewayRef: order.id },
  });

  return { orderId: order.id, quote, approveUrl: order.approveUrl };
}

/**
 * Can PayPal be offered right now? Requires live keys *and* a fresh FX rate —
 * without a rate we cannot name a price, and guessing one is not an option.
 */
export async function quotePaypalIfAvailable(
  idrTotal: number,
): Promise<ForeignChargeQuote | null> {
  if (!isPaypalLive()) return null;
  try {
    return await quoteForeignCharge(idrTotal, paypalPresentmentCurrency());
  } catch (err) {
    console.warn("[psp] PayPal unavailable — no usable FX rate:", err);
    return null;
  }
}

export type PaypalCaptureOutcome =
  | { ok: true; bookingReference: string; alreadyIssued: boolean }
  | { ok: false; reason: string };

/**
 * Capture an approved PayPal order and issue tickets in the same pass.
 *
 * Called from the pay page on return from PayPal — deliberately not waiting for
 * the webhook. PayPal takes the money client-side, so a delayed or lost webhook
 * would leave a paid customer with no ticket while the hold timer runs down.
 * The webhook still arrives and no-ops via `alreadyIssued`.
 */
export async function capturePaypalOrder(
  bookingReference: string,
  orderIdFromReturn?: string | null,
): Promise<PaypalCaptureOutcome> {
  const booking = await prisma.booking.findUnique({
    where: { bookingReference },
    include: { payment: true },
  });
  if (!booking) return { ok: false, reason: "Booking not found" };

  const payment = booking.payment;
  if (!payment?.gatewayReference || payment.gatewayProvider !== PaymentProvider.PAYPAL) {
    return { ok: false, reason: "No PayPal order for this booking" };
  }

  // PayPal echoes the approved order as ?token= on the return URL. Prefer it
  // over the stored reference, which goes stale if the customer opened a second
  // order before finishing the first.
  const orderId = orderIdFromReturn || payment.gatewayReference;

  let capture: CaptureResult;
  try {
    capture = await captureOrder(orderId);
  } catch (err) {
    console.error(`[psp] PayPal capture failed for ${bookingReference}:`, err);
    return { ok: false, reason: "Capture failed" };
  }

  // That token is attacker-supplied, so an order id alone proves nothing. The
  // capture must carry our booking reference back in custom_id — otherwise a
  // crafted ?token= would let an unrelated order issue tickets on this booking.
  if (capture.bookingReference && capture.bookingReference !== bookingReference) {
    console.error(
      `[psp] PayPal order ${orderId} belongs to ${capture.bookingReference}, not ${bookingReference}`,
    );
    return { ok: false, reason: "Order does not belong to this booking" };
  }
  if (!capture.bookingReference && orderId !== payment.gatewayReference) {
    // An unverifiable id we did not issue ourselves — refuse it.
    return { ok: false, reason: "Order could not be matched to this booking" };
  }

  if (!capture.completed) {
    return { ok: false, reason: `Capture not completed (${capture.status})` };
  }

  // Amount integrity: never confirm on a capture that doesn't match the amount
  // we quoted. A mismatch means the order was re-created at a different rate.
  if (capture.amount && payment.presentmentAmount) {
    const captured = Number(capture.amount);
    const quoted = Number(payment.presentmentAmount);
    if (!Number.isFinite(captured) || Math.abs(captured - quoted) > 0.01) {
      console.error(
        `[psp] PayPal amount mismatch for ${bookingReference}: captured=${captured} quoted=${quoted}`,
      );
      return { ok: false, reason: "Amount mismatch" };
    }
  }

  const result = await confirmPaymentAndIssueTickets({
    bookingId: booking.id,
    paidAt: new Date(),
    method: PaymentMethod.PAYPAL,
    gatewayReference: orderId,
    // gatewayFee is an IDR column; PayPal reports its fee in the presentment
    // currency, so convert at the same rate the charge used.
    gatewayFee: paypalFeeAsIdr(capture.feeAmount, payment.fxRate),
  });

  await prisma.payment.update({
    where: { bookingId: booking.id },
    data: {
      // The capture id — not the order id — is what a refund is issued against.
      instrumentData: {
        paypalOrderId: orderId,
        paypalCaptureId: capture.captureId,
      },
    },
  });

  return {
    ok: true,
    bookingReference: result.bookingReference,
    alreadyIssued: result.alreadyIssued,
  };
}

/** Convert a PayPal fee in presentment currency to IDR at the charge's rate. */
export function paypalFeeAsIdr(
  fee: number | null,
  fxRate: { toString(): string } | null,
): number | null {
  if (fee === null || fxRate === null) return null;
  const rate = Number(fxRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(fee * rate);
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
    PAYPAL: PaymentMethod.PAYPAL,
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
