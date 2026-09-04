/**
 * Registry of pre-approved WhatsApp template names.
 *
 * WhatsApp only lets a business open a conversation with a template, and Meta
 * resolves templates by name. These constants are what the senders reference;
 * the template copy with its {{1}}, {{2}} … placeholders must exist in the
 * Meta Business Manager (or WATI console) in the exact order documented on
 * each entry — Meta fills body parameters positionally, so the insertion
 * order of `params` at the call site must match the template's {{n}} order.
 *
 * The copy to submit for approval is in docs/meta-whatsapp-setup.md.
 */
export const WHATSAPP_TEMPLATE = {
  /** {{1}} route, {{2}} departure, {{3}} boat, {{4}} pax, {{5}} customer, {{6}} reference, {{7}} amount */
  OPERATOR_BOOKING_PAID: "gilifast_operator_booking_paid",
  /** {{1}} route, {{2}} departure, {{3}} boat, {{4}} pax, {{5}} reference */
  OPERATOR_BOOKING_CONFIRMED: "gilifast_operator_booking_confirmed",
  /** {{1}} customerName, {{2}} route, {{3}} boat, {{4}} departure, {{5}} reference, {{6}} lookupUrl */
  CUSTOMER_DEPARTURE_REMINDER: "gilifast_customer_departure_reminder",
} as const;
