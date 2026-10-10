import { describe, it, expect, vi, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  notifyPaymentReceived,
  notifyBoardingPassIssued,
  notifyOperatorUnavailable,
  notifyLegCancelled,
} from '@/features/booking/notifications';

/**
 * Unit tests for src/features/booking/notifications.ts
 *
 * Tests customer-facing notifications (email + WhatsApp) for booking lifecycle.
 * All notification sends swallow transport errors per spec.
 *
 * Mocking: Prisma queries, email, WhatsApp, PDF generation
 */

vi.mock('@/shared/server/db', () => ({
  prisma: {
    booking: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/features/messaging/email', () => ({
  sendPaymentReceivedEmail: vi.fn(),
  sendBookingConfirmation: vi.fn(),
  sendCancellationEmail: vi.fn(),
}));

vi.mock('@/features/messaging/whatsapp', () => ({
  sendPaymentReceivedWhatsapp: vi.fn(),
  sendBoardingPassWhatsapp: vi.fn(),
  sendBoardingPassDocument: vi.fn(),
  sendOperatorUnavailableWhatsapp: vi.fn(),
}));

vi.mock('@/features/tickets/boarding-pass', () => ({
  generateBoardingPassPdf: vi.fn(),
  generateBoardingPassPdfsForBooking: vi.fn(),
  boardingPassFilename: (bookingId: string) => `boarding-pass-${bookingId}.pdf`,
  boardingPassFilenameForLeg: (bookingId: string, legType: string) => `boarding-pass-${bookingId}-${legType}.pdf`,
}));

vi.mock('@/features/messaging/admin-alerts', () => ({
  alertAdminBookingPaid: vi.fn(),
}));

import { prisma } from '@/shared/server/db';
import {
  sendPaymentReceivedEmail,
  sendBookingConfirmation,
  sendCancellationEmail,
} from '@/features/messaging/email';
import {
  sendPaymentReceivedWhatsapp,
  sendBoardingPassWhatsapp,
  sendBoardingPassDocument,
  sendOperatorUnavailableWhatsapp,
} from '@/features/messaging/whatsapp';
import { generateBoardingPassPdf, generateBoardingPassPdfsForBooking } from '@/features/tickets/boarding-pass';
import { alertAdminBookingPaid } from '@/features/messaging/admin-alerts';

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

describe('notifyLegCancelled', () => {
  const booking = (id: string, reference: string, tripType: 'ONE_WAY' | 'ROUND_TRIP') => ({
    id,
    bookingReference: reference,
    tripType,
    customerName: 'Jane Doe',
    customerEmail: `${id}@example.com`,
    customerPhone: '+62812345679',
    totalAmount: new Prisma.Decimal('1000000'),
    tickets: [],
    leg:
      tripType === 'ONE_WAY'
        ? {
            departureDate: new Date('2026-10-25T08:00:00Z'),
            schedule: { originPort: 'BLI', destinationPort: 'SBY', boat: { name: 'Fast Boat A' } },
          }
        : null,
    outboundLeg:
      tripType === 'ROUND_TRIP'
        ? {
            departureDate: new Date('2026-10-25T08:00:00Z'),
            schedule: { originPort: 'BLI', destinationPort: 'SBY', boat: { name: 'Fast Boat A' } },
          }
        : null,
    returnLeg:
      tripType === 'ROUND_TRIP'
        ? {
            departureDate: new Date('2026-10-27T15:00:00Z'),
            schedule: { originPort: 'SBY', destinationPort: 'BLI', boat: { name: 'Fast Boat B' } },
          }
        : null,
  });

  it('emails and WhatsApps every cancelled booking, naming both legs of a round trip', async () => {
    vi.mocked(prisma.booking.findUnique)
      .mockResolvedValueOnce(booking('b-1', 'GILI-ONE', 'ONE_WAY') as any)
      .mockResolvedValueOnce(booking('b-2', 'GILI-RT', 'ROUND_TRIP') as any);
    vi.mocked(sendCancellationEmail).mockResolvedValue(EMAIL_RESULT);
    vi.mocked(sendOperatorUnavailableWhatsapp).mockResolvedValue(WHATSAPP_RESULT);

    await notifyLegCancelled([
      { bookingId: 'b-1', refundAmount: 500000 },
      { bookingId: 'b-2', refundAmount: 1000000 },
    ]);

    expect(sendCancellationEmail).toHaveBeenCalledTimes(2);
    expect(sendOperatorUnavailableWhatsapp).toHaveBeenCalledTimes(2);
    expect(sendCancellationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingReference: 'GILI-RT',
        refundAmount: 1000000,
        isRoundTrip: true,
        returnRoute: { originPort: 'SBY', destinationPort: 'BLI' },
      }),
    );
  });

  it('keeps notifying the rest when one booking fails to load', async () => {
    vi.mocked(prisma.booking.findUnique)
      .mockRejectedValueOnce(new Error('DB down'))
      .mockResolvedValueOnce(booking('b-2', 'GILI-RT', 'ROUND_TRIP') as any);
    vi.mocked(sendCancellationEmail).mockResolvedValue(EMAIL_RESULT);
    vi.mocked(sendOperatorUnavailableWhatsapp).mockResolvedValue(WHATSAPP_RESULT);

    await expect(
      notifyLegCancelled([
        { bookingId: 'b-1', refundAmount: 1 },
        { bookingId: 'b-2', refundAmount: 2 },
      ]),
    ).resolves.toBeUndefined();

    expect(sendCancellationEmail).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no booking was cancelled', async () => {
    await notifyLegCancelled([]);
    expect(prisma.booking.findUnique).not.toHaveBeenCalled();
  });
});

describe('round-trip boarding pass: two passes over WhatsApp and email', () => {
  const rtBooking = () => ({
    id: 'booking-rt-9',
    bookingReference: 'GILI-RT009',
    tripType: 'ROUND_TRIP' as const,
    customerName: 'Jane Doe',
    customerEmail: 'jane@example.com',
    customerPhone: '+62812345679',
    totalAmount: new Prisma.Decimal('1000000'),
    tickets: [{ id: 't-1' }],
    leg: null,
    outboundLeg: {
      basePrice: new Prisma.Decimal('500000'),
      departureDate: new Date('2026-10-25T08:00:00Z'),
      schedule: { originPort: 'BLI', destinationPort: 'SBY', boat: { name: 'Fast Boat A' } },
    },
    returnLeg: {
      basePrice: new Prisma.Decimal('500000'),
      departureDate: new Date('2026-10-27T15:00:00Z'),
      schedule: { originPort: 'SBY', destinationPort: 'BLI', boat: { name: 'Fast Boat B' } },
    },
  });
  const pdfs = [
    { filename: 'pass-outbound.pdf', content: Buffer.from('out') },
    { filename: 'pass-return.pdf', content: Buffer.from('ret') },
  ];
  const tickets = [{ ticketCode: 'TK-1', passengerName: 'Jane', qrPayload: 'qr' }];

  it('sends one WhatsApp document per leg, outbound first, each with its own route and time', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(rtBooking() as any);
    vi.mocked(generateBoardingPassPdfsForBooking).mockResolvedValueOnce(pdfs);
    vi.mocked(sendBoardingPassDocument).mockResolvedValue(WHATSAPP_RESULT);
    vi.mocked(sendBookingConfirmation).mockResolvedValue(EMAIL_RESULT);

    await notifyBoardingPassIssued('booking-rt-9', tickets as any);

    expect(sendBoardingPassDocument).toHaveBeenCalledTimes(2);
    const [first, second] = vi.mocked(sendBoardingPassDocument).mock.calls.map((c) => c[0]);
    expect(first).toMatchObject({
      filename: 'pass-outbound.pdf',
      route: { originPort: 'BLI', destinationPort: 'SBY' },
      departureDate: new Date('2026-10-25T08:00:00Z'),
      leg: { label: 'Berangkat', index: 1, total: 2 },
    });
    expect(second).toMatchObject({
      filename: 'pass-return.pdf',
      route: { originPort: 'SBY', destinationPort: 'BLI' },
      departureDate: new Date('2026-10-27T15:00:00Z'),
      leg: { label: 'Pulang', index: 2, total: 2 },
    });
  });

  it('keeps sending the email with both PDFs attached', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(rtBooking() as any);
    vi.mocked(generateBoardingPassPdfsForBooking).mockResolvedValueOnce(pdfs);
    vi.mocked(sendBoardingPassDocument).mockResolvedValue(WHATSAPP_RESULT);
    vi.mocked(sendBookingConfirmation).mockResolvedValue(EMAIL_RESULT);

    await notifyBoardingPassIssued('booking-rt-9', tickets as any);

    expect(sendBookingConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: pdfs, isRoundTrip: true }),
    );
  });

  it('still sends the return pass when the outbound WhatsApp send fails', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(rtBooking() as any);
    vi.mocked(generateBoardingPassPdfsForBooking).mockResolvedValueOnce(pdfs);
    vi.mocked(sendBoardingPassDocument)
      .mockRejectedValueOnce(new Error('WATI down'))
      .mockResolvedValueOnce(WHATSAPP_RESULT);
    vi.mocked(sendBookingConfirmation).mockResolvedValue(EMAIL_RESULT);

    await expect(notifyBoardingPassIssued('booking-rt-9', tickets as any)).resolves.toBeUndefined();

    expect(sendBoardingPassDocument).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendBoardingPassDocument).mock.calls[1][0]).toMatchObject({ filename: 'pass-return.pdf' });
  });

  it('a one-way booking still sends a single, unlabelled document', async () => {
    const oneWay = {
      ...rtBooking(),
      tripType: 'ONE_WAY' as const,
      leg: rtBooking().outboundLeg,
      outboundLeg: null,
      returnLeg: null,
    };
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(oneWay as any);
    vi.mocked(generateBoardingPassPdfsForBooking).mockResolvedValueOnce([pdfs[0]]);
    vi.mocked(sendBoardingPassDocument).mockResolvedValue(WHATSAPP_RESULT);
    vi.mocked(sendBookingConfirmation).mockResolvedValue(EMAIL_RESULT);

    await notifyBoardingPassIssued('booking-rt-9', tickets as any);

    expect(sendBoardingPassDocument).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendBoardingPassDocument).mock.calls[0][0].leg).toBeUndefined();
  });

  it('falls back to a text message that lists both legs when the PDFs cannot be generated', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(rtBooking() as any);
    vi.mocked(generateBoardingPassPdfsForBooking).mockRejectedValueOnce(new Error('pdf failed'));
    vi.mocked(sendBoardingPassWhatsapp).mockResolvedValue(WHATSAPP_RESULT);
    vi.mocked(sendBookingConfirmation).mockResolvedValue(EMAIL_RESULT);

    await notifyBoardingPassIssued('booking-rt-9', tickets as any);

    expect(sendBoardingPassDocument).not.toHaveBeenCalled();
    expect(sendBoardingPassWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({
        returnLeg: expect.objectContaining({
          route: { originPort: 'SBY', destinationPort: 'BLI' },
          boatName: 'Fast Boat B',
        }),
      }),
    );
  });

  it('cancellation WhatsApp carries both sailings for a round trip and none for one-way', async () => {
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(rtBooking() as any);
    vi.mocked(sendCancellationEmail).mockResolvedValue(EMAIL_RESULT);
    vi.mocked(sendOperatorUnavailableWhatsapp).mockResolvedValue(WHATSAPP_RESULT);

    await notifyOperatorUnavailable('booking-rt-9', 1000000);

    expect(sendOperatorUnavailableWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({
        trip: {
          outbound: {
            route: { originPort: 'BLI', destinationPort: 'SBY' },
            departureDate: new Date('2026-10-25T08:00:00Z'),
          },
          return: {
            route: { originPort: 'SBY', destinationPort: 'BLI' },
            departureDate: new Date('2026-10-27T15:00:00Z'),
          },
        },
      }),
    );

    vi.clearAllMocks();
    const oneWay = { ...rtBooking(), tripType: 'ONE_WAY' as const, leg: rtBooking().outboundLeg, outboundLeg: null, returnLeg: null };
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(oneWay as any);
    vi.mocked(sendCancellationEmail).mockResolvedValue(EMAIL_RESULT);
    vi.mocked(sendOperatorUnavailableWhatsapp).mockResolvedValue(WHATSAPP_RESULT);
    await notifyOperatorUnavailable('booking-rt-9', 500000);
    expect(vi.mocked(sendOperatorUnavailableWhatsapp).mock.calls[0][0].trip).toBeUndefined();
  });
});
