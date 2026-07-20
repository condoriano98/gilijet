import { isMidtransConfigured } from "./midtrans";
import { PaymentProvider } from "@prisma/client";

/**
 * Dispatch a refund through Midtrans. Midtrans Snap doesn't have a refund
 * API — refunds go through the Midtrans Dashboard or IRIS API. For the MVP
 * refunds are manual (operator/admin action in the dashboard).
 * Returns null to signal manual refund flow.
 */
export async function refundViaGateway(_args: {
  gatewayProvider: PaymentProvider | null;
  gatewayReference: string;
  amount: number;
  reason: string;
}): Promise<{ id: string; status: string } | null> {
  // Midtrans refunds are manual for the MVP.
  // When we integrate the Midtrans IRIS API, this is where the call goes.
  return null;
}

export function isAnyRefundGatewayConfigured(): boolean {
  return isMidtransConfigured();
}
