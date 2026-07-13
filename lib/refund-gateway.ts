import { createRefund as createDokuRefund, isDokuConfigured } from "./doku";
import { PaymentProvider } from "@prisma/client";

/**
 * Dispatch a refund through DOKU (the only gateway). Returns null when DOKU is
 * unconfigured (mock/manual refund flow).
 */
export async function refundViaGateway(args: {
  gatewayProvider: PaymentProvider | null;
  gatewayReference: string;
  amount: number;
  reason: string;
}): Promise<{ id: string; status: string } | null> {
  if (!isDokuConfigured()) return null;
  return await createDokuRefund({
    gatewayReference: args.gatewayReference,
    amount: args.amount,
    reason: args.reason,
  });
}

export function isAnyRefundGatewayConfigured(): boolean {
  return isDokuConfigured();
}
