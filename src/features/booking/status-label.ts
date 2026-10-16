import type { BookingStatus } from '@prisma/client';

const ADMIN_LABELS: Record<BookingStatus, string> = {
  PENDING_PAYMENT: 'Unpaid',
  // Payment is recorded; the boarding pass waits for the admin's call to the
  // operator. Showing the bare enum made a paid booking look like one the
  // gateway had never reported.
  AWAITING_CONFIRMATION: 'Paid · awaiting confirmation',
  CONFIRMED: 'Confirmed',
  CANCELLED_BY_CUSTOMER: 'Cancelled by customer',
  CANCELLED_BY_OPERATOR: 'Cancelled by operator',
  EXPIRED: 'Expired',
};

/** Label for a booking status in the admin back office. */
export function adminBookingStatusLabel(status: BookingStatus): string {
  return ADMIN_LABELS[status] ?? status.replace(/_/g, ' ');
}
