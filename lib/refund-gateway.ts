import { createRefund as createXenditRefund, isXenditConfigured } from "./xendit";
import { createRefund as createMayarRefund, isMayarConfigured } from "./mayar";

/**
 * Dispatch a refund through whichever gateway originally processed the
 * payment. Falls back to whichever gateway is configured if the payment
 * record doesn't know.
 *
 * Returns null if no gateway is configured (mock/manual refund flow).
 */
export async function refundViaGateway(args: {
  gatewayProvider: string | null;
  gatewayReference: string;
  amount: number;
  reason: string;
}): Promise<{ id: string; status: string } | null> {
  const provider = (args.gatewayProvider ?? "").toLowerCase();

  if (provider === "mayar" || (!provider && isMayarConfigured())) {
    if (!isMayarConfigured()) return null;
    return await createMayarRefund({
      transactionId: args.gatewayReference,
      amount: args.amount,
      reason: args.reason,
    });
  }

  if (provider === "xendit" || (!provider && isXenditConfigured())) {
    if (!isXenditConfigured()) return null;
    return await createXenditRefund({
      invoiceId: args.gatewayReference,
      amount: args.amount,
      reason: args.reason,
    });
  }

  return null;
}

export function isAnyRefundGatewayConfigured(): boolean {
  return isMayarConfigured() || isXenditConfigured();
}
