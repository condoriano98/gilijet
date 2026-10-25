/**
 * A phone number reduced to what identifies the line, so "+62 812-3456-7890",
 * "+620812 3456 7890" and "6281234567890" compare equal. The booking form
 * stores the dial code glued to whatever the customer typed, trunk "0" included.
 *
 * The coupon rules apply the same reduction in SQL to `Booking.customerPhone`
 * (`promotions.ts`); keep the two in step.
 */
export function phoneKey(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '').replace(/^620/, '62');
}
