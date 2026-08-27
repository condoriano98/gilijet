/**
 * Payment orchestration across two gateways.
 *
 * Midtrans Snap is primary and settles IDR. PayPal is the backup for cards
 * Midtrans declines — a different rail, so it often accepts what an Indonesian
 * acquirer refuses. It cannot settle IDR, so a PayPal booking is charged a
 * presentment amount at a stored rate; see lib/fx.ts quoteForeignCharge.
 *
 * Both converge on recordPaymentAwaitingConfirmation, so settlement, seat
 * handling and the payment-received notice are identical either way.
 *
 * The booking flow goes: reserve → /pay/{ref} → the customer picks a gateway →
 * that gateway's hosted page → payment settles → admin rings the operator to
 * check availability → tickets issued.
 */
import { PaymentMethod, PaymentProvider } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import {
  createCheckout,
  isMidtransConfigured,
  isMidtransMock,
  type CreateCheckoutResult,
} from "./midtrans";
import {
  captureOrder,
  createOrder,
  isPaypalLive,
  paypalCredentialsWork,
  paypalPresentmentCurrency,
  type CaptureResult,
} from "./paypal";
import { quoteForeignCharge, type ForeignChargeQuote } from "./fx";
import { applyGatewayModeOverrides } from "./payment-mode";
import { recordPaymentAwaitingConfirmation } from "./ticket-issuer";
import { notifyPaymentReceived } from "./booking-notifications";

/** True when a real (non-mock) gateway is configured. */
export function isAnyPSPConfigured(): boolean {
  return isMidtransConfigured() && !isMidtransMock();
}

/**
 * Open a Midtrans Snap checkout for a booking.  Called from the pay page server
 * action. Persists the order id as the gateway reference so the notification
 * can correlate back to this booking later.
 */
export async function startMidtransCheckout(
  bookingReference: string,
): Promise<CreateCheckoutResult> {
  // Pick up any console sandbox/live override before opening the checkout, so
  // the host follows the latest PlatformConfig value (see lib/payment-mode.ts).
  await applyGatewayModeOverrides();

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
      gatewayProvider: PaymentProvider.MIDTRANS,
      gatewayReference: result.orderId,
    },
  });
  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentGatewayRef: result.orderId },
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
 * treat that as "PayPal is unavailable" and leave the customer on Midtrans —
 * charging a guessed rate is worse than not offering the option.
 */
export async function startPaypalOrder(
  bookingReference: string,
): Promise<PaypalOrderResult> {
  await applyGatewayModeOverrides();

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
    description: `Gilifast ${booking.leg.schedule.originPort} → ${booking.leg.schedule.destinationPort}`,
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
 * Can PayPal be offered right now?
 *
 * Three things must hold: keys configured, keys that actually authenticate, and
 * a fresh FX rate. The middle one matters because presence is not correctness —
 * wrong host or revoked key would otherwise render a button that fails the
 * moment a customer trusts it, which for a backup gateway is worse than showing
 * nothing. Without a rate we cannot name a price, and guessing is not an option.
 */
export async function quotePaypalIfAvailable(
  idrTotal: number,
): Promise<ForeignChargeQuote | null> {
  await applyGatewayModeOverrides();
  if (!isPaypalLive()) return null;
  if (!(await paypalCredentialsWork())) return null;
  try {
    return await quoteForeignCharge(idrTotal, paypalPresentmentCurrency());
  } catch (err) {
    console.warn("[psp] PayPal unavailable — no usable FX rate:", err);
    return null;
  }
}

export type PaypalCaptureOutcome =
  | { ok: true; bookingReference: string; alreadyRecorded: boolean }
  | { ok: false; reason: string };

/**
 * Capture an approved PayPal order and record the booking as paid.
 *
 * Called from the pay page on return from PayPal — deliberately not waiting for
 * the webhook. PayPal takes the money client-side, so a delayed or lost webhook
 * would leave a paid customer with a booking still counting down its hold
 * timer. The webhook still arrives and no-ops via `alreadyRecorded`.
 *
 * No boarding pass is issued here; that waits on the admin's call to the
 * operator. See lib/ticket-issuer.ts.
 */
export async function capturePaypalOrder(
  bookingReference: string,
  orderIdFromReturn?: string | null,
): Promise<PaypalCaptureOutcome> {
  await applyGatewayModeOverrides();

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

  const result = await recordPaymentAwaitingConfirmation({
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

  if (!result.alreadyRecorded) {
    notifyPaymentReceived(booking.id).catch((err) =>
      console.error("[psp] notify failed:", err),
    );
  }

  return {
    ok: true,
    bookingReference: result.bookingReference,
    alreadyRecorded: result.alreadyRecorded,
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
 * Normalise a gateway channel id / payment_type into a PaymentMethod enum.
 * Throws on unknown values so new channels are never silently dropped.
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
    // Midtrans payment types (Snap notification `payment_type`).
    BANK_TRANSFER_BCA: PaymentMethod.VA_BCA,
    BANK_TRANSFER_BNI: PaymentMethod.VA_BNI,
    BANK_TRANSFER_BRI: PaymentMethod.VA_BRI,
    BANK_TRANSFER_MANDIRI: PaymentMethod.VA_MANDIRI,
    BANK_TRANSFER_PERMATA: PaymentMethod.VA_PERMATA,
    BANK_TRANSFER_VA: PaymentMethod.BANK_TRANSFER,
    ECHANNEL: PaymentMethod.BANK_TRANSFER,
    CSTORE: PaymentMethod.BANK_TRANSFER,
    AKULAKU: PaymentMethod.BANK_TRANSFER,
    KREDIVO: PaymentMethod.BANK_TRANSFER,
    BCA_KLIKPAY: PaymentMethod.BANK_TRANSFER,
    BCA_KLIKBCA: PaymentMethod.BANK_TRANSFER,
    BRI_EPAY: PaymentMethod.BANK_TRANSFER,
    CIMB_CLICKS: PaymentMethod.BANK_TRANSFER,
    DANAMON_ONLINE: PaymentMethod.BANK_TRANSFER,
    UOB_EZPAY: PaymentMethod.BANK_TRANSFER,
    INDOMARET: PaymentMethod.BANK_TRANSFER,
    ALFAMART: PaymentMethod.BANK_TRANSFER,
  };
  if (mapping[upper]) return mapping[upper];

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
