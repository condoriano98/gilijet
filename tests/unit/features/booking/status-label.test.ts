import { describe, it, expect } from 'vitest';
import { BookingStatus } from '@prisma/client';
import { adminBookingStatusLabel, customerBookingStatusLabel } from '@/features/booking/status-label';

describe('adminBookingStatusLabel', () => {
  it('says a paid booking is paid, not just "awaiting confirmation"', () => {
    expect(adminBookingStatusLabel('AWAITING_CONFIRMATION')).toBe(
      'Paid · awaiting confirmation',
    );
    expect(adminBookingStatusLabel('PENDING_PAYMENT')).toBe('Unpaid');
  });

  it('labels every status', () => {
    for (const status of Object.values(BookingStatus)) {
      const label = adminBookingStatusLabel(status);
      expect(label, status).not.toMatch(/_/);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('customerBookingStatusLabel', () => {
  it('tells a customer who paid that the payment arrived', () => {
    expect(customerBookingStatusLabel('AWAITING_CONFIRMATION')).toBe(
      'Paid · confirming your seat',
    );
    expect(customerBookingStatusLabel('PENDING_PAYMENT')).toBe('Awaiting payment');
  });

  it('labels every status without underscores', () => {
    for (const status of Object.values(BookingStatus)) {
      expect(customerBookingStatusLabel(status), status).not.toMatch(/_/);
    }
  });
});
