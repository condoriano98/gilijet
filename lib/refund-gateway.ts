import { isDokuConfigured } from "./doku";
import { PaymentProvider } from "@prisma/client";

/**
 * Dispatch a refund through DOKU. DOKU refunds are raised from the DOKU
 * dashboard for the MVP, so this returns null to signal the manual flow rather
 * than pretending money moved.
 *
 * When we integrate DOKU's refund API, this is where the call goes — and it
 * refunds IDR, the currency the payment was taken in, so there is no
 * conversion to get wrong.
 */
export async function refundViaGateway(_args: {
  gatewayProvider: PaymentProvider | null;
  gatewayReference: string;
  amount: number;
  reason: string;
}): Promise<{ id: string; status: string } | null> {
  return null;
}

export function isAnyRefundGatewayConfigured(): boolean {
  return isDokuConfigured();
}
