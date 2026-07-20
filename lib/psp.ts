/**
 * Payment orchestration — Xendit is the sole gateway.
 *
 * Payment creation lives in booking-engine's startPaymentForBooking (which
 * creates a Xendit invoice and returns the hosted-page URL). This module keeps
 * the shared helpers: gateway-configured check and the webhook method mapping.
 */
import { PaymentMethod } from "@prisma/client";
import { isXenditConfigured, isXenditMock } from "./xendit";

/** True when a real (non-mock) Xendit gateway is configured. */
export function isAnyPSPConfigured(): boolean {
  return isXenditConfigured() && !isXenditMock();
}

/**
 * Normalise a raw payment method / channel id from a Xendit notification into a
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
    // Xendit invoice method types
    QR_CODE: PaymentMethod.QRIS,
    EWALLET: PaymentMethod.GOPAY,
    RETAIL_OUTLET: PaymentMethod.BANK_TRANSFER,
    DIRECT_DEBIT: PaymentMethod.BANK_TRANSFER,
    VIRTUAL_ACCOUNT: PaymentMethod.BANK_TRANSFER,
    CARD: PaymentMethod.CREDIT_CARD,
    // legacy channel ids (harmless)
    VIRTUAL_ACCOUNT_BCA: PaymentMethod.VA_BCA,
    VIRTUAL_ACCOUNT_BNI: PaymentMethod.VA_BNI,
    VIRTUAL_ACCOUNT_BRI: PaymentMethod.VA_BRI,
    VIRTUAL_ACCOUNT_BANK_MANDIRI: PaymentMethod.VA_MANDIRI,
    VIRTUAL_ACCOUNT_BANK_PERMATA: PaymentMethod.VA_PERMATA,
    EMONEY_OVO: PaymentMethod.OVO,
    EMONEY_DANA: PaymentMethod.DANA,
    EMONEY_SHOPEE_PAY: PaymentMethod.SHOPEEPAY,
    EMONEY_SHOPEEPAY: PaymentMethod.SHOPEEPAY,
    EMONEY_LINKAJA: PaymentMethod.LINKAJA,
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
