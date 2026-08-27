import { isMidtransConfigured } from "./midtrans";
import { isPaypalLive, refundCapture } from "./paypal";
import { prisma } from "./db";
import { PaymentProvider } from "@prisma/client";

/**
 * Dispatch a refund to whichever gateway took the money.
 *
 * Midtrans refunds are raised from its dashboard for the MVP, signalled by
 * returning null rather than pretending money moved. PayPal refunds
 * programmatically, and must return the currency it captured.
 */
export async function refundViaGateway(args: {
  gatewayProvider: PaymentProvider | null;
  gatewayReference: string;
  amount: number;
  reason: string;
}): Promise<{ id: string; status: string } | null> {
  // PayPal can refund programmatically, and must be refunded in the currency it
  // captured. The IDR amount an admin sees is converted back at the *stored*
  // rate from the original charge, never today's: re-quoting weeks later would
  // return a different sum than the customer paid.
  if (args.gatewayProvider === PaymentProvider.PAYPAL) {
    return refundPaypal(args);
  }

  // Midtrans refunds are raised from the Midtrans dashboard for the MVP.
  return null;
}

async function refundPaypal(args: {
  gatewayReference: string;
  amount: number;
  reason: string;
}): Promise<{ id: string; status: string } | null> {
  if (!isPaypalLive()) return null;

  const payment = await prisma.payment.findFirst({
    where: { gatewayReference: args.gatewayReference },
    select: {
      presentmentCurrency: true,
      presentmentAmount: true,
      fxRate: true,
      instrumentData: true,
    },
  });
  if (!payment) return null;

  // The refund is issued against the capture, not the order.
  const instrument = (payment.instrumentData ?? {}) as { paypalCaptureId?: string };
  const captureId = instrument.paypalCaptureId;
  if (!captureId) {
    console.error(
      `[refund-gateway] no PayPal capture id for ${args.gatewayReference} — refund must be issued manually`,
    );
    return null;
  }

  const { presentmentCurrency: currency, presentmentAmount, fxRate } = payment;
  if (!currency || !presentmentAmount || !fxRate) {
    console.error(
      `[refund-gateway] PayPal payment ${args.gatewayReference} is missing presentment data — refund must be issued manually`,
    );
    return null;
  }

  // Convert the requested IDR refund back at the original rate, then clamp:
  // a partial refund must never exceed what was actually captured.
  const captured = Number(presentmentAmount);
  const requested = Math.round((args.amount / Number(fxRate)) * 100) / 100;
  const value = Math.min(requested, captured).toFixed(2);

  if (Number(value) <= 0) return null;

  return refundCapture({
    captureId,
    amount: value,
    currency,
    reason: args.reason,
  });
}

export function isAnyRefundGatewayConfigured(): boolean {
  return isMidtransConfigured() || isPaypalLive();
}
