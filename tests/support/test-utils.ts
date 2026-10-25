import { Prisma } from '@prisma/client';
import { vi } from 'vitest';

/**
 * Shared test utilities and mock factories for unit tests
 *
 * Provides:
 * - Prisma mock setup (safe to call multiple times)
 * - Mock data factories (boats, bookings, legs, schedules)
 * - Common test fixtures
 */

/**
 * Setup Prisma mocks for a test. Safe to call in beforeEach.
 * Returns mocked prisma instance with jest-style mock methods.
 */
export function setupPrismaMocks() {
  // Get the mocked prisma from the mocked module
  const { prisma } = require('@/shared/server/db');

  // Ensure all query methods are mocked
  const queryMethods = [
    'findUnique',
    'findFirst',
    'findMany',
    'create',
    'update',
    'delete',
    'createMany',
    'updateMany',
    'deleteMany',
  ];

  // Mock boat queries
  for (const method of queryMethods) {
    if (!prisma.boat[method]) {
      prisma.boat[method] = vi.fn();
    }
    prisma.boat[method] = vi.fn();
  }

  // Mock schedule queries
  for (const method of queryMethods) {
    if (!prisma.schedule[method]) {
      prisma.schedule[method] = vi.fn();
    }
    prisma.schedule[method] = vi.fn();
  }

  // Mock leg queries
  for (const method of queryMethods) {
    if (!prisma.leg[method]) {
      prisma.leg[method] = vi.fn();
    }
    prisma.leg[method] = vi.fn();
  }

  // Mock booking queries
  for (const method of queryMethods) {
    if (!prisma.booking[method]) {
      prisma.booking[method] = vi.fn();
    }
    prisma.booking[method] = vi.fn();
  }

  // Mock ticket queries
  for (const method of queryMethods) {
    if (!prisma.ticket[method]) {
      prisma.ticket[method] = vi.fn();
    }
    prisma.ticket[method] = vi.fn();
  }

  return prisma;
}

/**
 * Clear all Prisma mocks. Call in afterEach.
 */
export function clearPrismaMocks() {
  const { prisma } = require('@/shared/server/db');
  vi.clearAllMocks();
}

// ============== Mock Factories ==============

export function mockBoat(overrides = {}) {
  return {
    id: 'boat-1',
    operatorId: 'op-1',
    name: 'Test Boat',
    capacity: 50,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

export function mockSchedule(overrides = {}) {
  return {
    id: 'sched-1',
    boatId: 'boat-1',
    originPort: 'BLI',
    destinationPort: 'SBY',
    departureTime: '08:00',
    arrivalTime: '12:00',
    daysOfWeek: '1111100',
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

export function mockLeg(overrides = {}) {
  return {
    id: 'leg-1',
    scheduleId: 'sched-1',
    operatorId: 'op-1',
    departureDate: new Date('2026-10-25T08:00:00Z'),
    basePrice: new Prisma.Decimal('250000'),
    status: 'OPEN' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    cancellationReason: null,
    ...overrides,
  };
}

export function mockBooking(overrides = {}) {
  return {
    id: 'booking-1',
    bookingReference: 'GILI-ABC123',
    legId: 'leg-1',
    outboundLegId: null,
    returnLegId: null,
    tripType: 'ONE_WAY' as const,
    operatorId: 'op-1',
    customerId: null,
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    customerPhone: '+62812345678',
    customerNationality: null,
    totalAmount: new Prisma.Decimal('500000'),
    commissionAmount: new Prisma.Decimal('40000'),
    operatorAmount: new Prisma.Decimal('460000'),
    promotionId: null,
    discountAmount: new Prisma.Decimal('0'),
    status: 'CONFIRMED' as const,
    salesChannel: 'GILIFAST' as const,
    salesStaffId: null,
    salesAgentId: null,
    refundDeadline: new Date('2026-10-22T08:00:00Z'),
    refundPolicySnapshot: null,
    notes: null,
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function mockTicket(overrides = {}) {
  return {
    id: 'ticket-1',
    bookingId: 'booking-1',
    code: 'TKT001',
    passengerName: 'John Doe',
    passengerNationality: null,
    passengerAge: null,
    seatNumber: '001',
    qrPayload: 'qr-payload-xyz',
    boarded: false,
    checkedInBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ============== Common Test Fixtures ==============

export const fixtureBoat = mockBoat({
  id: 'boat-fixture-1',
  operatorId: 'op-fixture-1',
  name: 'Fixture Boat',
});

export const fixtureSchedule = mockSchedule({
  id: 'sched-fixture-1',
  boatId: 'boat-fixture-1',
});

export const fixtureLeg = mockLeg({
  id: 'leg-fixture-1',
  scheduleId: 'sched-fixture-1',
  operatorId: 'op-fixture-1',
});

export const fixtureBooking = mockBooking({
  id: 'booking-fixture-1',
  legId: 'leg-fixture-1',
  operatorId: 'op-fixture-1',
});
