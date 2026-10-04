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
  generateBoardingPassPdfsForBooking: vi.fn(),
  boardingPassFilename: (bookingId: string) => `boarding-pass-${bookingId}.pdf`,
  boardingPassFilenameForLeg: (bookingId: string, legType: string) => `boarding-pass-${bookingId}-${legType}.pdf`,
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
import { generateBoardingPassPdf, generateBoardingPassPdfsForBooking } from '@/lib/boarding-pass';
import { alertAdminBookingPaid } from '@/lib/admin-alerts';

afterEach(() => {
  vi.clearAllMocks();
});

const EMAIL_RESULT = { delivered: true, provider: 'console' as const };
const WHATSAPP_RESULT = { delivered: true, provider: 'console' as const };

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
    vi.mocked(sendPaymentReceivedEmail).mockResolvedValueOnce(EMAIL_RESULT);
    vi.mocked(sendPaymentReceivedWhatsapp).mockResolvedValueOnce(WHATSAPP_RESULT);
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
    vi.mocked(sendPaymentReceivedWhatsapp).mockResolvedValueOnce(WHATSAPP_RESULT);
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
    vi.mocked(sendPaymentReceivedEmail).mockResolvedValueOnce(EMAIL_RESULT);
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
    vi.mocked(sendPaymentReceivedEmail).mockResolvedValueOnce(EMAIL_RESULT);
    vi.mocked(sendPaymentReceivedWhatsapp).mockResolvedValueOnce(WHATSAPP_RESULT);
    vi.mocked(alertAdminBookingPaid).mockResolvedValueOnce(undefined);

    await notifyPaymentReceived('booking-1');

    expect(alertAdminBookingPaid).toHaveBeenCalledWith('booking-1');
  });
});

describe('notifyBoardingPassIssued', () => {
  it('sends boarding pass email and WhatsApp with PDF', async () => {
    const mockTickets = [
      {
        ticketCode: 'TKT001',
        passengerName: 'John Doe',
        qrPayload: 'TKT001.2026-10-25.signature',
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
      tickets: [{ id: 'ticket-1' }],
      leg: {
        basePrice: new Prisma.Decimal('500000'),
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
    vi.mocked(generateBoardingPassPdfsForBooking).mockResolvedValueOnce([
      { filename: 'boarding-pass-GILI-ABC123.pdf', content: Buffer.from('PDF content') },
    ]);
    vi.mocked(sendBoardingPassDocument).mockResolvedValueOnce(WHATSAPP_RESULT);
    vi.mocked(sendBookingConfirmation).mockResolvedValueOnce(EMAIL_RESULT);

    await notifyBoardingPassIssued('booking-1', mockTickets);

    expect(generateBoardingPassPdfsForBooking).toHaveBeenCalledWith('GILI-ABC123');
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
      tickets: [{ id: 'ticket-1' }],
      leg: {
        basePrice: new Prisma.Decimal('500000'),
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
    vi.mocked(generateBoardingPassPdfsForBooking).mockRejectedValueOnce(
      new Error('PDF generation failed'),
    );
    vi.mocked(sendBoardingPassWhatsapp).mockResolvedValueOnce(WHATSAPP_RESULT);
    vi.mocked(sendBookingConfirmation).mockResolvedValueOnce(EMAIL_RESULT);

    // Should not throw even though PDF generation failed
    await expect(notifyBoardingPassIssued('booking-1', [])).resolves.toBeUndefined();

    expect(generateBoardingPassPdfsForBooking).toHaveBeenCalled();
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
    vi.mocked(sendOperatorUnavailableWhatsapp).mockResolvedValueOnce(WHATSAPP_RESULT);

    await notifyOperatorUnavailable('booking-1', 500000);

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
    await expect(notifyOperatorUnavailable('booking-1', 500000)).resolves.toBeUndefined();

    expect(sendOperatorUnavailableWhatsapp).toHaveBeenCalled();
  });
});

// ─── Round-Trip Booking Tests ────────────────────────────────────────────

describe('Round-trip booking notifications', () => {
  it('notifyPaymentReceived sends email with outbound + return legs', async () => {
    const mockBooking = {
      id: 'booking-rt-1',
      bookingReference: 'GILI-RT001',
      tripType: 'ROUND_TRIP' as const,
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      customerPhone: '+62812345679',
      totalAmount: new Prisma.Decimal('1000000'),
      tickets: [{ id: 'ticket-1' }, { id: 'ticket-2' }],
      leg: null,
      outboundLeg: {
        basePrice: new Prisma.Decimal('500000'),
        departureDate: new Date('2026-10-25T08:00:00Z'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          boat: { name: 'Fast Boat A' },
        },
      },
      returnLeg: {
        basePrice: new Prisma.Decimal('500000'),
        departureDate: new Date('2026-10-27T15:00:00Z'),
        schedule: {
          originPort: 'SBY',
          destinationPort: 'BLI',
          boat: { name: 'Fast Boat B' },
        },
      },
    };

    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking as any);
    vi.mocked(sendPaymentReceivedEmail).mockResolvedValueOnce(EMAIL_RESULT);
    vi.mocked(sendPaymentReceivedWhatsapp).mockResolvedValueOnce(WHATSAPP_RESULT);
    vi.mocked(alertAdminBookingPaid).mockResolvedValueOnce(undefined);

    await notifyPaymentReceived('booking-rt-1');

    expect(sendPaymentReceivedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingReference: 'GILI-RT001',
        isRoundTrip: true,
        returnRoute: {
          originPort: 'SBY',
          destinationPort: 'BLI',
        },
        returnBoatName: 'Fast Boat B',
        returnDepartureDate: new Date('2026-10-27T15:00:00Z'),
      }),
    );
  });

  it('notifyBoardingPassIssued generates 2 PDFs for round-trip', async () => {
    const mockTickets = [
      {
        ticketCode: 'TKT-RT-001',
        passengerName: 'Jane Doe',
        qrPayload: 'TKT-RT-001.2026-10-25.signature',
      },
    ];

    const mockBooking = {
      id: 'booking-rt-1',
      bookingReference: 'GILI-RT001',
      tripType: 'ROUND_TRIP' as const,
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      customerPhone: '+62812345679',
      totalAmount: new Prisma.Decimal('1000000'),
      tickets: [{ id: 'ticket-1' }],
      leg: null,
      outboundLeg: {
        basePrice: new Prisma.Decimal('500000'),
        departureDate: new Date('2026-10-25T08:00:00Z'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          boat: { name: 'Fast Boat A' },
        },
      },
      returnLeg: {
        basePrice: new Prisma.Decimal('500000'),
        departureDate: new Date('2026-10-27T15:00:00Z'),
        schedule: {
          originPort: 'SBY',
          destinationPort: 'BLI',
          boat: { name: 'Fast Boat B' },
        },
      },
    };

    const mockPdfs = [
      { filename: 'boarding-pass-GILI-RT001-outbound.pdf', content: Buffer.from('PDF outbound') },
      { filename: 'boarding-pass-GILI-RT001-return.pdf', content: Buffer.from('PDF return') },
    ];

    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking as any);
    vi.mocked(generateBoardingPassPdfsForBooking).mockResolvedValueOnce(mockPdfs);
    vi.mocked(sendBoardingPassDocument).mockResolvedValueOnce(WHATSAPP_RESULT);
    vi.mocked(sendBookingConfirmation).mockResolvedValueOnce(EMAIL_RESULT);

    await notifyBoardingPassIssued('booking-rt-1', mockTickets);

    // Verify both outbound and return info passed to email
    expect(sendBookingConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingReference: 'GILI-RT001',
        isRoundTrip: true,
        returnRoute: {
          originPort: 'SBY',
          destinationPort: 'BLI',
        },
        returnBoatName: 'Fast Boat B',
        outboundPrice: 500000, // 500000 * 1 passenger
        returnPrice: 500000,
      }),
    );

    // Verify PDFs attached to email
    expect(sendBookingConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({ filename: 'boarding-pass-GILI-RT001-outbound.pdf' }),
          expect.objectContaining({ filename: 'boarding-pass-GILI-RT001-return.pdf' }),
        ]),
      }),
    );
  });

  it('notifyOperatorUnavailable shows both legs in cancellation email', async () => {
    const mockBooking = {
      id: 'booking-rt-1',
      bookingReference: 'GILI-RT001',
      tripType: 'ROUND_TRIP' as const,
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      customerPhone: '+62812345679',
      totalAmount: new Prisma.Decimal('1000000'),
      tickets: [{ id: 'ticket-1' }],
      leg: null,
      outboundLeg: {
        basePrice: new Prisma.Decimal('500000'),
        departureDate: new Date('2026-10-25T08:00:00Z'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          boat: { name: 'Fast Boat A' },
        },
      },
      returnLeg: {
        basePrice: new Prisma.Decimal('500000'),
        departureDate: new Date('2026-10-27T15:00:00Z'),
        schedule: {
          originPort: 'SBY',
          destinationPort: 'BLI',
          boat: { name: 'Fast Boat B' },
        },
      },
    };

    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking as any);
    vi.mocked(sendCancellationEmail).mockResolvedValueOnce(EMAIL_RESULT);
    vi.mocked(sendOperatorUnavailableWhatsapp).mockResolvedValueOnce(WHATSAPP_RESULT);

    await notifyOperatorUnavailable('booking-rt-1', 1000000);

    expect(sendCancellationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingReference: 'GILI-RT001',
        refundAmount: 1000000,
        isRoundTrip: true,
        returnRoute: {
          originPort: 'SBY',
          destinationPort: 'BLI',
        },
      }),
    );
  });

  it('calculates correct pricing for round-trip with multiple passengers', async () => {
    const mockTickets = [
      {
        ticketCode: 'TKT-RT-001',
        passengerName: 'Passenger 1',
        qrPayload: 'TKT-RT-001.sig',
      },
      {
        ticketCode: 'TKT-RT-002',
        passengerName: 'Passenger 2',
        qrPayload: 'TKT-RT-002.sig',
      },
      {
        ticketCode: 'TKT-RT-003',
        passengerName: 'Passenger 3',
        qrPayload: 'TKT-RT-003.sig',
      },
    ];

    const mockBooking = {
      id: 'booking-rt-3pax',
      bookingReference: 'GILI-RT3PAX',
      tripType: 'ROUND_TRIP' as const,
      customerName: 'Group Booking',
      customerEmail: 'group@example.com',
      customerPhone: '+62812345680',
      totalAmount: new Prisma.Decimal('3000000'), // 1.5M + 1.5M
      tickets: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
      leg: null,
      outboundLeg: {
        basePrice: new Prisma.Decimal('500000'),
        departureDate: new Date('2026-10-25T08:00:00Z'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          boat: { name: 'Big Boat' },
        },
      },
      returnLeg: {
        basePrice: new Prisma.Decimal('500000'),
        departureDate: new Date('2026-10-27T15:00:00Z'),
        schedule: {
          originPort: 'SBY',
          destinationPort: 'BLI',
          boat: { name: 'Big Boat' },
        },
      },
    };

    const mockPdfs = [
      { filename: 'boarding-pass-GILI-RT3PAX-outbound.pdf', content: Buffer.from('PDF') },
      { filename: 'boarding-pass-GILI-RT3PAX-return.pdf', content: Buffer.from('PDF') },
    ];

    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(mockBooking as any);
    vi.mocked(generateBoardingPassPdfsForBooking).mockResolvedValueOnce(mockPdfs);
    vi.mocked(sendBoardingPassDocument).mockResolvedValueOnce(WHATSAPP_RESULT);
    vi.mocked(sendBookingConfirmation).mockResolvedValueOnce(EMAIL_RESULT);

    await notifyBoardingPassIssued('booking-rt-3pax', mockTickets);

    expect(sendBookingConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        outboundPrice: 1500000, // 500000 * 3 passengers
        returnPrice: 1500000, // 500000 * 3 passengers
      }),
    );
  });
});
