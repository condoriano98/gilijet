import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';

/**
 * Unit tests for lib/ticket-issuer.ts
 *
 * Tests ticketing workflow:
 * - recordPaymentAwaitingConfirmation: marks booking as awaiting operator confirmation
 * - issueTicketsForBooking: mints tickets after admin confirms with operator
 * - rejectBookingAvailability: cancels booking when operator can't take it
 */

const mocks = vi.hoisted(() => ({
  prismaTransaction: vi.fn(),
  releaseBookingSeats: vi.fn().mockResolvedValue(undefined),
  getMainLeg: vi.fn(),
  buildQrPayload: vi.fn().mockReturnValue('TK-CODE.2026-10-15.SIGNATURE'),
  signTicketCode: vi.fn().mockReturnValue('SIGNATURE'),
  newTicketCode: vi.fn(),
  ymdInZone: vi.fn().mockReturnValue('2026-10-15'),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: mocks.prismaTransaction,
  },
}));

vi.mock('@/lib/booking-engine', () => ({
  releaseBookingSeats: mocks.releaseBookingSeats,
}));

vi.mock('@/lib/booking-helpers', () => ({
  getMainLeg: mocks.getMainLeg,
}));

vi.mock('@/lib/qr', () => ({
  buildQrPayload: mocks.buildQrPayload,
  signTicketCode: mocks.signTicketCode,
}));

vi.mock('@/lib/references', () => ({
  newTicketCode: mocks.newTicketCode,
}));

vi.mock('@/lib/datetime', () => ({
  ymdInZone: mocks.ymdInZone,
}));

async function loadTicketIssuer() {
  vi.resetModules();
  return import('@/lib/ticket-issuer');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.newTicketCode.mockImplementation((ref, idx) => `TK-${ref.slice(3)}-${idx}`);
});

afterEach(() => {
  vi.resetModules();
});

describe('recordPaymentAwaitingConfirmation', () => {
  it('marks PENDING_PAYMENT booking as AWAITING_CONFIRMATION', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const booking = {
      id: 'bk-1',
      bookingReference: 'BK-2026-10-ABC123',
      status: 'PENDING_PAYMENT',
      notes: JSON.stringify({
        passengers: [{ name: 'John Doe', idNumber: 'ID001' }],
      }),
      payment: null,
      totalAmount: new Prisma.Decimal('500000'),
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
        update: vi.fn().mockResolvedValue({
          ...booking,
          status: 'AWAITING_CONFIRMATION',
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    const result = await ticketIssuer.recordPaymentAwaitingConfirmation({
      bookingId: 'bk-1',
      paidAt: new Date('2026-10-15T10:00:00Z'),
      method: 'BANK_TRANSFER',
    });

    expect(result).toEqual({
      bookingReference: 'BK-2026-10-ABC123',
      alreadyRecorded: false,
    });

    expect(tx.booking.update).toHaveBeenCalledWith({
      where: { id: 'bk-1' },
      data: { status: 'AWAITING_CONFIRMATION' },
    });
  });

  it('returns alreadyRecorded=true for non-PENDING_PAYMENT status', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const booking = {
      id: 'bk-2',
      bookingReference: 'BK-2026-10-XYZ789',
      status: 'AWAITING_CONFIRMATION', // Already processed
      payment: null,
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    const result = await ticketIssuer.recordPaymentAwaitingConfirmation({
      bookingId: 'bk-2',
    });

    expect(result).toEqual({
      bookingReference: 'BK-2026-10-XYZ789',
      alreadyRecorded: true,
    });

    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('throws when booking not found', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await expect(
      ticketIssuer.recordPaymentAwaitingConfirmation({
        bookingId: 'nonexistent',
      }),
    ).rejects.toThrow('Booking nonexistent not found');
  });

  it('throws when no passenger list in notes', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const booking = {
      id: 'bk-3',
      bookingReference: 'BK-2026-10-NO-PASS',
      status: 'PENDING_PAYMENT',
      notes: null, // No passenger list
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await expect(
      ticketIssuer.recordPaymentAwaitingConfirmation({
        bookingId: 'bk-3',
      }),
    ).rejects.toThrow('has no passenger list to ticket');
  });

  it('updates existing payment with new status and metadata', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const existingPayment = {
      id: 'pay-1',
      bookingId: 'bk-4',
      status: 'PENDING',
      gatewayReference: 'DOKU-1234',
    };

    const booking = {
      id: 'bk-4',
      bookingReference: 'BK-2026-10-PAY',
      status: 'PENDING_PAYMENT',
      notes: JSON.stringify({
        passengers: [{ name: 'Jane Smith' }],
      }),
      payment: existingPayment,
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
        update: vi.fn().mockResolvedValue({ ...booking, status: 'AWAITING_CONFIRMATION' }),
      },
      payment: {
        update: vi.fn().mockResolvedValue({
          ...existingPayment,
          status: 'SUCCESSFUL',
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await ticketIssuer.recordPaymentAwaitingConfirmation({
      bookingId: 'bk-4',
      paidAt: new Date('2026-10-15T11:00:00Z'),
      gatewayReference: 'DOKU-5678',
      method: 'VA_BCA',
    });

    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: 'bk-4' },
        data: expect.objectContaining({
          status: 'SUCCESSFUL',
          gatewayReference: 'DOKU-5678',
          method: 'VA_BCA',
        }),
      }),
    );
  });
});

describe('issueTicketsForBooking', () => {
  it('mints tickets for a CONFIRMED booking', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const leg = {
      id: 'leg-1',
      departureDate: new Date('2026-10-20T08:00:00Z'),
    };

    mocks.getMainLeg.mockReturnValue(leg);

    const booking = {
      id: 'bk-5',
      bookingReference: 'BK-2026-10-ISSUE',
      status: 'AWAITING_CONFIRMATION',
      notes: JSON.stringify({
        passengers: [
          { name: 'Passenger One', idNumber: 'ID-001' },
          { name: 'Passenger Two', idNumber: 'ID-002' },
        ],
      }),
      tickets: [],
      leg: null,
      outboundLeg: null,
      returnLeg: null,
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
        update: vi.fn().mockResolvedValue({
          ...booking,
          status: 'CONFIRMED',
        }),
      },
      ticket: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));
    mocks.ymdInZone.mockReturnValue('2026-10-20');

    const result = await ticketIssuer.issueTicketsForBooking({
      bookingId: 'bk-5',
      adminId: 'admin-1',
      note: 'Confirmed with operator',
    });

    expect(result).toMatchObject({
      bookingReference: 'BK-2026-10-ISSUE',
      alreadyIssued: false,
      tickets: expect.arrayContaining([
        expect.objectContaining({
          passengerName: 'Passenger One',
          qrPayload: 'TK-CODE.2026-10-15.SIGNATURE',
        }),
        expect.objectContaining({
          passengerName: 'Passenger Two',
          qrPayload: 'TK-CODE.2026-10-15.SIGNATURE',
        }),
      ]),
    });

    expect(tx.ticket.create).toHaveBeenCalledTimes(2);
  });

  it('returns existing tickets when already CONFIRMED', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const leg = {
      id: 'leg-2',
      departureDate: new Date('2026-10-25T10:00:00Z'),
    };

    mocks.getMainLeg.mockReturnValue(leg);

    const existingTickets = [
      {
        id: 'tk-1',
        ticketCode: 'TK-2026-10-ABC123-1',
        passengerName: 'John Existing',
      },
    ];

    const booking = {
      id: 'bk-6',
      bookingReference: 'BK-2026-10-EXISTING',
      status: 'CONFIRMED',
      notes: JSON.stringify({
        passengers: [{ name: 'John Existing' }],
      }),
      tickets: existingTickets,
      leg: null,
      outboundLeg: null,
      returnLeg: null,
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    const result = await ticketIssuer.issueTicketsForBooking({
      bookingId: 'bk-6',
      adminId: 'admin-2',
    });

    expect(result).toMatchObject({
      bookingReference: 'BK-2026-10-EXISTING',
      alreadyIssued: true,
      tickets: expect.arrayContaining([
        expect.objectContaining({
          ticketCode: 'TK-2026-10-ABC123-1',
          passengerName: 'John Existing',
        }),
      ]),
    });
  });

  it('throws when booking is not AWAITING_CONFIRMATION or CONFIRMED', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const booking = {
      id: 'bk-7',
      bookingReference: 'BK-2026-10-CANCELLED',
      status: 'CANCELLED_BY_OPERATOR',
      tickets: [],
      leg: null,
      outboundLeg: null,
      returnLeg: null,
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await expect(
      ticketIssuer.issueTicketsForBooking({
        bookingId: 'bk-7',
        adminId: 'admin-3',
      }),
    ).rejects.toThrow('Cannot issue tickets for BK-2026-10-CANCELLED');
  });

  it('throws when no passenger list exists', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const leg = {
      id: 'leg-3',
      departureDate: new Date('2026-10-30T14:00:00Z'),
    };

    mocks.getMainLeg.mockReturnValue(leg);

    const booking = {
      id: 'bk-8',
      bookingReference: 'BK-2026-10-NO-PASSENGERS',
      status: 'AWAITING_CONFIRMATION',
      notes: null, // No passengers
      tickets: [],
      leg: null,
      outboundLeg: null,
      returnLeg: null,
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await expect(
      ticketIssuer.issueTicketsForBooking({
        bookingId: 'bk-8',
        adminId: 'admin-4',
      }),
    ).rejects.toThrow('has no passenger list to ticket');
  });

  it('creates audit log with ticket details and admin note', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const leg = {
      id: 'leg-4',
      departureDate: new Date('2026-11-01T09:00:00Z'),
    };

    mocks.getMainLeg.mockReturnValue(leg);

    const booking = {
      id: 'bk-9',
      bookingReference: 'BK-2026-11-AUDIT',
      status: 'AWAITING_CONFIRMATION',
      notes: JSON.stringify({
        passengers: [{ name: 'Audit Test User' }],
      }),
      tickets: [],
      leg: null,
      outboundLeg: null,
      returnLeg: null,
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
        update: vi.fn().mockResolvedValue({ ...booking, status: 'CONFIRMED' }),
      },
      ticket: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));
    mocks.ymdInZone.mockReturnValue('2026-11-01');

    await ticketIssuer.issueTicketsForBooking({
      bookingId: 'bk-9',
      adminId: 'admin-5',
      note: 'Operator confirmed availability',
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'BOOKING',
          entityId: 'bk-9',
          action: 'operator_confirmed_and_ticketed',
          userRole: 'ADMIN',
          userId: 'admin-5',
          newState: expect.objectContaining({
            note: 'Operator confirmed availability',
          }),
        }),
      }),
    );
  });
});

describe('rejectBookingAvailability', () => {
  it('cancels booking and creates full refund', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const booking = {
      id: 'bk-10',
      bookingReference: 'BK-2026-11-REJECT',
      status: 'AWAITING_CONFIRMATION',
      totalAmount: new Prisma.Decimal('500000'),
      refund: null,
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
        update: vi.fn().mockResolvedValue({
          ...booking,
          status: 'CANCELLED_BY_OPERATOR',
        }),
      },
      refund: {
        create: vi.fn().mockResolvedValue({
          id: 'refund-1',
          refundAmount: new Prisma.Decimal('500000'),
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    const result = await ticketIssuer.rejectBookingAvailability({
      bookingId: 'bk-10',
      adminId: 'admin-6',
      note: 'No boats available',
    });

    expect(result).toEqual({
      bookingReference: 'BK-2026-11-REJECT',
      alreadyRejected: false,
      refundAmount: '500000',
    });

    expect(tx.booking.update).toHaveBeenCalledWith({
      where: { id: 'bk-10' },
      data: expect.objectContaining({
        status: 'CANCELLED_BY_OPERATOR',
      }),
    });

    expect(tx.refund.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: 'OPERATOR_CANCELLATION',
          refundAmount: new Prisma.Decimal('500000'),
        }),
      }),
    );

    expect(mocks.releaseBookingSeats).toHaveBeenCalledWith('bk-10', 'cancelled_by_operator');
  });

  it('returns alreadyRejected=true for already-cancelled bookings', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const existingRefund = {
      id: 'refund-existing',
      refundAmount: new Prisma.Decimal('500000'),
    };

    const booking = {
      id: 'bk-11',
      bookingReference: 'BK-2026-11-ALREADY-REJ',
      status: 'CANCELLED_BY_OPERATOR',
      totalAmount: new Prisma.Decimal('500000'),
      refund: existingRefund,
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
        update: vi.fn(),
      },
      refund: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    const result = await ticketIssuer.rejectBookingAvailability({
      bookingId: 'bk-11',
      adminId: 'admin-7',
    });

    expect(result).toEqual({
      bookingReference: 'BK-2026-11-ALREADY-REJ',
      alreadyRejected: true,
      refundAmount: '500000',
    });

    expect(tx.booking.update).not.toHaveBeenCalled();
    expect(mocks.releaseBookingSeats).not.toHaveBeenCalled();
  });

  it('throws when booking is not AWAITING_CONFIRMATION', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const booking = {
      id: 'bk-12',
      bookingReference: 'BK-2026-11-CONFIRMED',
      status: 'CONFIRMED',
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await expect(
      ticketIssuer.rejectBookingAvailability({
        bookingId: 'bk-12',
        adminId: 'admin-8',
      }),
    ).rejects.toThrow('Cannot reject BK-2026-11-CONFIRMED');
  });

  it('does not create duplicate refund if one already exists', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const existingRefund = {
      id: 'refund-dup',
      refundAmount: new Prisma.Decimal('750000'),
    };

    const booking = {
      id: 'bk-13',
      bookingReference: 'BK-2026-11-DUP-REFUND',
      status: 'AWAITING_CONFIRMATION',
      totalAmount: new Prisma.Decimal('750000'),
      refund: existingRefund,
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
        update: vi.fn().mockResolvedValue({
          ...booking,
          status: 'CANCELLED_BY_OPERATOR',
        }),
      },
      refund: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await ticketIssuer.rejectBookingAvailability({
      bookingId: 'bk-13',
      adminId: 'admin-9',
    });

    expect(tx.refund.create).not.toHaveBeenCalled(); // Existing refund retained
  });

  it('creates audit log with rejection reason', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const booking = {
      id: 'bk-14',
      bookingReference: 'BK-2026-11-AUDIT-REJ',
      status: 'AWAITING_CONFIRMATION',
      totalAmount: new Prisma.Decimal('600000'),
      refund: null,
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
        update: vi.fn().mockResolvedValue({
          ...booking,
          status: 'CANCELLED_BY_OPERATOR',
        }),
      },
      refund: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await ticketIssuer.rejectBookingAvailability({
      bookingId: 'bk-14',
      adminId: 'admin-10',
      note: 'Boat broken down, no replacement available',
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'BOOKING',
          entityId: 'bk-14',
          action: 'operator_unavailable_cancelled',
          userRole: 'ADMIN',
          userId: 'admin-10',
          newState: expect.objectContaining({
            note: 'Boat broken down, no replacement available',
          }),
        }),
      }),
    );
  });
});

describe('Passenger List Parsing', () => {
  it('handles multiple passenger types correctly', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const leg = {
      id: 'leg-mixed',
      departureDate: new Date('2026-11-10T12:00:00Z'),
    };

    mocks.getMainLeg.mockReturnValue(leg);

    const booking = {
      id: 'bk-mixed',
      bookingReference: 'BK-2026-11-MIXED',
      status: 'AWAITING_CONFIRMATION',
      notes: JSON.stringify({
        passengers: [
          { name: 'Adult 1', idNumber: 'ADULT-001' },
          { name: 'Child 1', idNumber: 'CHILD-001' },
          { name: 'Infant 1' }, // No ID
        ],
      }),
      tickets: [],
      leg: null,
      outboundLeg: null,
      returnLeg: null,
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
        update: vi.fn().mockResolvedValue({ ...booking, status: 'CONFIRMED' }),
      },
      ticket: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));
    mocks.ymdInZone.mockReturnValue('2026-11-10');

    const result = await ticketIssuer.issueTicketsForBooking({
      bookingId: 'bk-mixed',
      adminId: 'admin-mixed',
    });

    expect(result.tickets).toHaveLength(3);
    expect(tx.ticket.create).toHaveBeenCalledTimes(3);

    // Verify passenger names are preserved
    const calls = tx.ticket.create.mock.calls;
    expect(calls[0][0].data.passengerName).toBe('Adult 1');
    expect(calls[1][0].data.passengerName).toBe('Child 1');
    expect(calls[2][0].data.passengerName).toBe('Infant 1');
  });

  it('handles invalid JSON in notes gracefully', async () => {
    const ticketIssuer = await loadTicketIssuer();

    const booking = {
      id: 'bk-invalid-json',
      bookingReference: 'BK-2026-11-INVALID',
      status: 'PENDING_PAYMENT',
      notes: 'This is just a free-text note, not JSON',
    };

    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await expect(
      ticketIssuer.recordPaymentAwaitingConfirmation({
        bookingId: 'bk-invalid-json',
      }),
    ).rejects.toThrow('has no passenger list to ticket');
  });
});
