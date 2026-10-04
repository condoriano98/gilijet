import { describe, it, expect, vi, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  notifyPaymentReceived,
  notifyBoardingPassIssued,
  notifyOperatorUnavailable,
} from '@/lib/booking-notifications';

/**
 * Unit tests for lib/booking-notifications.ts
 *
 * Tests customer-facing notifications (email + WhatsApp) for booking lifecycle.
 * All notification sends swallow transport errors per spec.
 *
 * Mocking: Prisma queries, email, WhatsApp, PDF generation
 */

vi.mock('@/lib/db', () => ({
  prisma: {
    booking: {
      findUnique: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/email', () => ({
  sendPaymentReceivedEmail: vi.fn(),
  sendBookingConfirmation: vi.fn(),
  sendCancellationEmail: vi.fn(),
}));

vi.mock('@/lib/whatsapp', () => ({
  sendPaymentReceivedWhatsapp: vi.fn(),
  sendBoardingPassWhatsapp: vi.fn(),
  sendBoardingPassDocument: vi.fn(),
  sendOperatorUnavailableWhatsapp: vi.fn(),
}));

vi.mock('@/lib/boarding-pass', () => ({
  generateBoardingPassPdf: vi.fn(),
  boardingPassFilename: (bookingId: string) => `boarding-pass-${bookingId}.pdf`,
}));

vi.mock('@/lib/admin-alerts', () => ({
  alertAdminBookingPaid: vi.fn(),
}));

import { prisma } from '@/lib/db';
import {
  sendPaymentReceivedEmail,
  sendBookingConfirmation,
  sendCancellationEmail,
} from '@/lib/email';
import {
  sendPaymentReceivedWhatsapp,
  sendBoardingPassWhatsapp,
  sendBoardingPassDocument,
  sendOperatorUnavailableWhatsapp,
} from '@/lib/whatsapp';
import { generateBoardingPassPdf } from '@/lib/boarding-pass';
import { alertAdminBookingPaid } from '@/lib/admin-alerts';

afterEach(() => {
  vi.clearAllMocks();
});

describe('notifyPaymentReceived', () => {
  it('sends email and WhatsApp notifications together', async () => {
    const mockBooking = {
      id: 'booking-1',
      bookingReference: 'GILI-ABC123',
      tripType: 'ONE_WAY' as const,
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      customerPhone: '+62812345678',
      totalAmount: new Prisma.Decimal('500000'),
      leg: {
        departureDate: new Date('2026-10-25T08:00:00Z'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          boat: { name: 'Fast Boat' },
        },
      },
      outboundLeg: null,
      returnLeg: null,
    };

    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking as any);
    vi.mocked(sendPaymentReceivedEmail).mockResolvedValueOnce(undefined);
    vi.mocked(sendPaymentReceivedWhatsapp).mockResolvedValueOnce(undefined);
    vi.mocked(alertAdminBookingPaid).mockResolvedValueOnce(undefined);

    await notifyPaymentReceived('booking-1');

    expect(prisma.booking.findUnique).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      select: expect.objectContaining({
        id: true,
        bookingReference: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
      }),
    });
    expect(sendPaymentReceivedEmail).toHaveBeenCalled();
    expect(sendPaymentReceivedWhatsapp).toHaveBeenCalled();
    expect(alertAdminBookingPaid).toHaveBeenCalled();
  });

  it('swallows email send errors', async () => {
    const mockBooking = {
      id: 'booking-1',
      bookingReference: 'GILI-ABC123',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      customerPhone: '+62812345678',
      tripType: 'ONE_WAY' as const,
      totalAmount: new Prisma.Decimal('500000'),
      leg: {
        departureDate: new Date('2026-10-25T08:00:00Z'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          boat: { name: 'Fast Boat' },
        },
      },
      outboundLeg: null,
      returnLeg: null,
    };

    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking as any);
    vi.mocked(sendPaymentReceivedEmail).mockRejectedValueOnce(new Error('Email service down'));
    vi.mocked(sendPaymentReceivedWhatsapp).mockResolvedValueOnce(undefined);
    vi.mocked(alertAdminBookingPaid).mockResolvedValueOnce(undefined);

    // Should not throw even though email failed
    await expect(notifyPaymentReceived('booking-1')).resolves.toBeUndefined();

    // Both transports should have been attempted
    expect(sendPaymentReceivedEmail).toHaveBeenCalled();
    expect(sendPaymentReceivedWhatsapp).toHaveBeenCalled();
  });

  it('swallows WhatsApp send errors', async () => {
    const mockBooking = {
      id: 'booking-1',
      bookingReference: 'GILI-ABC123',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      customerPhone: '+62812345678',
      tripType: 'ONE_WAY' as const,
      totalAmount: new Prisma.Decimal('500000'),
      leg: {
        departureDate: new Date('2026-10-25T08:00:00Z'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          boat: { name: 'Fast Boat' },
        },
      },
      outboundLeg: null,
      returnLeg: null,
    };

    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking as any);
    vi.mocked(sendPaymentReceivedEmail).mockResolvedValueOnce(undefined);
    vi.mocked(sendPaymentReceivedWhatsapp).mockRejectedValueOnce(new Error('WATI down'));
    vi.mocked(alertAdminBookingPaid).mockResolvedValueOnce(undefined);

    // Should not throw even though WhatsApp failed
    await expect(notifyPaymentReceived('booking-1')).resolves.toBeUndefined();

    expect(sendPaymentReceivedEmail).toHaveBeenCalled();
    expect(sendPaymentReceivedWhatsapp).toHaveBeenCalled();
  });

  it('alerts admin when payment is received', async () => {
    const mockBooking = {
      id: 'booking-1',
      bookingReference: 'GILI-ABC123',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      customerPhone: '+62812345678',
      tripType: 'ONE_WAY' as const,
      totalAmount: new Prisma.Decimal('500000'),
      leg: {
        departureDate: new Date('2026-10-25T08:00:00Z'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          boat: { name: 'Fast Boat' },
        },
      },
      outboundLeg: null,
      returnLeg: null,
    };

    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking as any);
    vi.mocked(sendPaymentReceivedEmail).mockResolvedValueOnce(undefined);
    vi.mocked(sendPaymentReceivedWhatsapp).mockResolvedValueOnce(undefined);
    vi.mocked(alertAdminBookingPaid).mockResolvedValueOnce(undefined);

    await notifyPaymentReceived('booking-1');

    expect(alertAdminBookingPaid).toHaveBeenCalledWith('booking-1');
  });
});

describe('notifyBoardingPassIssued', () => {
  it('sends boarding pass email and WhatsApp with PDF', async () => {
    const mockTickets = [
      {
        id: 'ticket-1',
        code: 'TKT001',
        passengerName: 'John Doe',
        seatNumber: '001',
      },
    ];

    const mockBooking = {
      id: 'booking-1',
      bookingReference: 'GILI-ABC123',
      tripType: 'ONE_WAY' as const,
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      customerPhone: '+62812345678',
      totalAmount: new Prisma.Decimal('500000'),
      leg: {
        departureDate: new Date('2026-10-25T08:00:00Z'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          boat: { name: 'Fast Boat' },
        },
      },
      outboundLeg: null,
      returnLeg: null,
    };

    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking as any);
    vi.mocked(generateBoardingPassPdf).mockResolvedValueOnce(Buffer.from('PDF content'));
    vi.mocked(sendBoardingPassWhatsapp).mockResolvedValueOnce(undefined);
    vi.mocked(sendBoardingPassDocument).mockResolvedValueOnce(undefined);
    vi.mocked(sendBookingConfirmation).mockResolvedValueOnce(undefined);

    await notifyBoardingPassIssued('booking-1', mockTickets);

    expect(generateBoardingPassPdf).toHaveBeenCalledWith('GILI-ABC123');
    // When PDF succeeds, sendBoardingPassDocument is called, not WhatsApp
    expect(sendBoardingPassDocument).toHaveBeenCalled();
    expect(sendBoardingPassWhatsapp).not.toHaveBeenCalled();
  });

  it('swallows PDF generation errors', async () => {
    const mockBooking = {
      id: 'booking-1',
      bookingReference: 'GILI-ABC123',
      tripType: 'ONE_WAY' as const,
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      customerPhone: '+62812345678',
      totalAmount: new Prisma.Decimal('500000'),
      leg: {
        departureDate: new Date('2026-10-25T08:00:00Z'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          boat: { name: 'Fast Boat' },
        },
      },
      outboundLeg: null,
      returnLeg: null,
    };

    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking as any);
    vi.mocked(generateBoardingPassPdf).mockRejectedValueOnce(new Error('PDF generation failed'));
    vi.mocked(sendBoardingPassWhatsapp).mockResolvedValueOnce(undefined);
    vi.mocked(sendBoardingPassDocument).mockResolvedValueOnce(undefined);
    vi.mocked(sendBookingConfirmation).mockResolvedValueOnce(undefined);

    // Should not throw even though PDF generation failed
    await expect(notifyBoardingPassIssued('booking-1', [])).resolves.toBeUndefined();

    expect(generateBoardingPassPdf).toHaveBeenCalled();
    // Should still try to send messages without PDF
    expect(sendBoardingPassWhatsapp).toHaveBeenCalled();
  });
});

describe('notifyOperatorUnavailable', () => {
  it('sends WhatsApp notification when operator is unavailable', async () => {
    const mockBooking = {
      id: 'booking-1',
      bookingReference: 'GILI-ABC123',
      tripType: 'ONE_WAY' as const,
      customerName: 'John Doe',
      customerPhone: '+62812345678',
      leg: {
        departureDate: new Date('2026-10-25T08:00:00Z'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          boat: { name: 'Fast Boat' },
        },
      },
      outboundLeg: null,
      returnLeg: null,
    };

    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking as any);
    vi.mocked(sendOperatorUnavailableWhatsapp).mockResolvedValueOnce(undefined);

    await notifyOperatorUnavailable('booking-1');

    expect(sendOperatorUnavailableWhatsapp).toHaveBeenCalled();
  });

  it('swallows WhatsApp send errors when operator unavailable', async () => {
    const mockBooking = {
      id: 'booking-1',
      bookingReference: 'GILI-ABC123',
      tripType: 'ONE_WAY' as const,
      customerName: 'John Doe',
      customerPhone: '+62812345678',
      leg: {
        departureDate: new Date('2026-10-25T08:00:00Z'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          boat: { name: 'Fast Boat' },
        },
      },
      outboundLeg: null,
      returnLeg: null,
    };

    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking as any);
    vi.mocked(sendOperatorUnavailableWhatsapp).mockRejectedValueOnce(new Error('WATI error'));

    // Should not throw
    await expect(notifyOperatorUnavailable('booking-1')).resolves.toBeUndefined();

    expect(sendOperatorUnavailableWhatsapp).toHaveBeenCalled();
  });
});
