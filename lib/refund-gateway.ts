import { createRefund as createXenditRefund, isXenditConfigured } from "./xendit";
import { PaymentProvider } from "@prisma/client";

/**
 * Dispatch a refund through Xendit (the only gateway). Returns null when Xendit
 * is unconfigured (mock/manual refund flow).
 */
export async function refundViaGateway(args: {
  gatewayProvider: PaymentProvider | null;
  gatewayReference: string;
  amount: number;
  reason: string;
}): Promise<{ id: string; status: string } | null> {
  if (!isXenditConfigured()) return null;
  return await createXenditRefund({
    invoiceId: args.gatewayReference,
    amount: args.amount,
    reason: args.reason,
  });
}

export function isAnyRefundGatewayConfigured(): boolean {
  return isXenditConfigured();
}
