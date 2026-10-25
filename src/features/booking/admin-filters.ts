import { Prisma, BookingStatus, PaymentMethod, TripType } from '@prisma/client';

export const BOOKING_STATUS_FILTERS: BookingStatus[] = [
  'PENDING_PAYMENT',
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_OPERATOR',
  'EXPIRED',
];

export const TRIP_TYPE_FILTERS: { value: TripType; label: string }[] = [
  { value: 'ONE_WAY', label: 'One way' },
  { value: 'ROUND_TRIP', label: 'Round trip' },
];

/** Raw query-string values of the admin bookings list. */
export type BookingFilters = {
  q?: string;
  status?: string;
  paymentMethod?: string;
  tripType?: string;
};

const FILTER_KEYS = ['q', 'status', 'paymentMethod', 'tripType'] as const;

/**
 * One `where` for the admin bookings page and its CSV export, so the export is
 * always exactly what the screen shows. Values that are not a known enum member
 * are ignored rather than passed to Prisma.
 */
export function buildBookingWhere(filters: BookingFilters): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {};
  if (filters.status && BOOKING_STATUS_FILTERS.includes(filters.status as BookingStatus)) {
    where.status = filters.status as BookingStatus;
  }
  if (filters.paymentMethod && Object.values(PaymentMethod).includes(filters.paymentMethod as PaymentMethod)) {
    where.payment = { method: filters.paymentMethod as PaymentMethod };
  }
  if (filters.tripType && TRIP_TYPE_FILTERS.some((t) => t.value === filters.tripType)) {
    where.tripType = filters.tripType as TripType;
  }
  const term = filters.q?.trim();
  if (term) {
    where.OR = [
      { bookingReference: { contains: term, mode: 'insensitive' } },
      { customerEmail: { contains: term, mode: 'insensitive' } },
      { customerName: { contains: term, mode: 'insensitive' } },
    ];
  }
  return where;
}

/**
 * A link that keeps every active filter and changes only what `patch` names
 * (`undefined` clears one). The single place that builds these links, so a new
 * filter cannot be dropped by another filter's chips.
 */
export function bookingsHref(path: string, filters: BookingFilters, patch: BookingFilters = {}): string {
  const merged: BookingFilters = { ...filters, ...patch };
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = merged[key];
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
