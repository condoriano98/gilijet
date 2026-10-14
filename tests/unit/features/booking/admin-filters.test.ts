import { describe, it, expect } from 'vitest';
import { buildBookingWhere, bookingsHref } from '@/features/booking/admin-filters';

describe('buildBookingWhere', () => {
  it('is empty with no filters', () => {
    expect(buildBookingWhere({})).toEqual({});
  });

  it('applies each filter on its own', () => {
    expect(buildBookingWhere({ status: 'CONFIRMED' })).toEqual({ status: 'CONFIRMED' });
    expect(buildBookingWhere({ paymentMethod: 'PAYPAL' })).toEqual({ payment: { method: 'PAYPAL' } });
    expect(buildBookingWhere({ tripType: 'ROUND_TRIP' })).toEqual({ tripType: 'ROUND_TRIP' });
    expect(buildBookingWhere({ tripType: 'ONE_WAY' })).toEqual({ tripType: 'ONE_WAY' });
  });

  it('searches reference, email and name, trimmed and case-insensitive', () => {
    const where = buildBookingWhere({ q: '  jane ' });
    expect(where.OR).toHaveLength(3);
    expect(where.OR).toContainEqual({ bookingReference: { contains: 'jane', mode: 'insensitive' } });
    expect(buildBookingWhere({ q: '   ' })).toEqual({});
  });

  it('combines every filter', () => {
    expect(
      buildBookingWhere({ q: 'x', status: 'EXPIRED', paymentMethod: 'PAYPAL', tripType: 'ROUND_TRIP' }),
    ).toMatchObject({ status: 'EXPIRED', payment: { method: 'PAYPAL' }, tripType: 'ROUND_TRIP' });
  });

  it('ignores values that are not a known enum member', () => {
    expect(buildBookingWhere({ status: 'DROP TABLE', paymentMethod: 'BITCOIN', tripType: 'MULTI_CITY' })).toEqual({});
  });
});

describe('bookingsHref', () => {
  const base = '/admin/bookings';

  it('has no query string without filters', () => {
    expect(bookingsHref(base, {})).toBe(base);
  });

  it('keeps the other filters when one changes', () => {
    const filters = { q: 'jane', status: 'CONFIRMED', paymentMethod: 'PAYPAL' };
    const href = bookingsHref(base, filters, { tripType: 'ROUND_TRIP' });
    const params = new URL(href, 'http://x').searchParams;
    expect(Object.fromEntries(params)).toEqual({
      q: 'jane',
      status: 'CONFIRMED',
      paymentMethod: 'PAYPAL',
      tripType: 'ROUND_TRIP',
    });
  });

  it('clears one filter with undefined and keeps the rest', () => {
    const href = bookingsHref(base, { status: 'CONFIRMED', tripType: 'ROUND_TRIP' }, { status: undefined });
    expect(href).toBe('/admin/bookings?tripType=ROUND_TRIP');
  });

  it('works for the CSV endpoint too', () => {
    expect(bookingsHref('/api/admin/bookings/csv', { paymentMethod: 'PAYPAL' })).toBe(
      '/api/admin/bookings/csv?paymentMethod=PAYPAL',
    );
  });
});
