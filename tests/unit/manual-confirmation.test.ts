import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  bookingFindUnique: vi.fn(),
  bookingUpdate: vi.fn(),
  bookingUpdateMany: vi.fn(),
  legUpdateMany: vi.fn(),
  paymentUpdate: vi.fn(),
  ticketCreate: vi.fn(),
  refundCreate: vi.fn(),
  auditCreate: vi.fn(),
  releaseSeats: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        booking: {
          findUnique: mocks.bookingFindUnique,
          update: mocks.bookingUpdate,
          updateMany: mocks.bookingUpdateMany,
        },
        leg: { updateMany: mocks.legUpdateMany },
        payment: { update: mocks.paymentUpdate },
        ticket: { create: mocks.ticketCreate },
        refund: { create: mocks.refundCreate },
        auditLog: { create: mocks.auditCreate },
      }),
  },
}));

vi.mock("@/lib/booking-engine", () => ({
  releaseBookingSeats: mocks.releaseSeats,
}));

// Ticket codes are HMAC-signed, so the issuer needs a key to run at all.
vi.mock("@/lib/env", () => ({
  env: { QR_HMAC_SECRET: "test-secret-at-least-32-chars-long-ok" },
}));

import {
  recordPaymentAwaitingConfirmation,
  issueTicketsForBooking,
  rejectBookingAvailability,
  SYSTEM_ACTOR_ID,
} from "@/lib/ticket-issuer";

const NOTES = JSON.stringify({
  passengers: [
    { name: "Ayu", idNumber: "123" },
    { name: "Budi", idNumber: "456" },
  ],
});

const baseBooking = (over: Record<string, unknown> = {}) => ({
  id: "bk-1",
  bookingReference: "GLJ-AAA111",
  status: "PENDING_PAYMENT",
  notes: NOTES,
  totalAmount: { toString: () => "500000" },
  payment: { gatewayReference: "REF", method: "QRIS", gatewayFee: null },
  tickets: [],
  refund: null,
  legId: "leg-1",
  leg: { departureDate: new Date("2026-09-01T02:00:00Z") },
  ...over,
});

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  // Healthy leg and an uncontested booking unless a test says otherwise.
  mocks.legUpdateMany.mockResolvedValue({ count: 1 });
  mocks.bookingUpdateMany.mockResolvedValue({ count: 1 });
  mocks.bookingUpdate.mockResolvedValue({});
  mocks.paymentUpdate.mockResolvedValue({});
  mocks.ticketCreate.mockResolvedValue({});
  mocks.refundCreate.mockResolvedValue({});
  mocks.auditCreate.mockResolvedValue({});
  mocks.releaseSeats.mockResolvedValue(undefined);
});

describe("recordPaymentAwaitingConfirmation", () => {
  it("marks the booking awaiting confirmation and mints no tickets", async () => {
    mocks.bookingFindUnique.mockResolvedValue(baseBooking());

    const out = await recordPaymentAwaitingConfirmation({ bookingId: "bk-1" });

    expect(out.alreadyRecorded).toBe(false);
    expect(mocks.bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "AWAITING_CONFIRMATION" },
      }),
    );
    // The whole point of the change: money settling issues no boarding pass.
    expect(mocks.ticketCreate).not.toHaveBeenCalled();
  });

  it("still marks the payment successful", async () => {
    mocks.bookingFindUnique.mockResolvedValue(baseBooking());

    await recordPaymentAwaitingConfirmation({ bookingId: "bk-1" });

    expect(mocks.paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCESSFUL" }),
      }),
    );
  });

  it("no-ops on webhook redelivery instead of re-notifying", async () => {
    mocks.bookingFindUnique.mockResolvedValue(
      baseBooking({ status: "AWAITING_CONFIRMATION" }),
    );

    const out = await recordPaymentAwaitingConfirmation({ bookingId: "bk-1" });

    expect(out.alreadyRecorded).toBe(true);
    expect(mocks.bookingUpdate).not.toHaveBeenCalled();
  });

  it("cannot drag an already-confirmed booking backwards", async () => {
    mocks.bookingFindUnique.mockResolvedValue(
      baseBooking({ status: "CONFIRMED" }),
    );

    const out = await recordPaymentAwaitingConfirmation({ bookingId: "bk-1" });

    expect(out.alreadyRecorded).toBe(true);
    expect(mocks.bookingUpdate).not.toHaveBeenCalled();
  });
});

describe("issueTicketsForBooking", () => {
  it("mints one ticket per passenger and confirms the booking", async () => {
    mocks.bookingFindUnique.mockResolvedValue(
      baseBooking({ status: "AWAITING_CONFIRMATION" }),
    );

    const out = await issueTicketsForBooking({
      bookingId: "bk-1",
      actor: { role: "ADMIN", id: "admin-1" },
      note: "Called Pak Made, boat running",
    });

    expect(out.alreadyIssued).toBe(false);
    expect(out.tickets).toHaveLength(2);
    expect(mocks.ticketCreate).toHaveBeenCalledTimes(2);
    expect(mocks.bookingUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bk-1", status: "AWAITING_CONFIRMATION" },
        data: expect.objectContaining({
          status: "CONFIRMED",
          availabilityDecidedById: "admin-1",
          availabilityNote: "Called Pak Made, boat running",
        }),
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userRole: "ADMIN", userId: "admin-1" }),
      }),
    );
  });

  it("refuses to ticket a departure that was cancelled underneath it", async () => {
    mocks.bookingFindUnique.mockResolvedValue(
      baseBooking({ status: "AWAITING_CONFIRMATION" }),
    );
    mocks.legUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      issueTicketsForBooking({
        bookingId: "bk-1",
        actor: { role: "ADMIN", id: "admin-1" },
      }),
    ).rejects.toThrow(/cancelled, sailed or in the past/);
    expect(mocks.ticketCreate).not.toHaveBeenCalled();
    expect(mocks.bookingUpdateMany).not.toHaveBeenCalled();
  });

  it("mints nothing when another caller decided the booking first", async () => {
    mocks.bookingFindUnique.mockResolvedValue(
      baseBooking({ status: "AWAITING_CONFIRMATION" }),
    );
    mocks.bookingUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      issueTicketsForBooking({
        bookingId: "bk-1",
        actor: { role: "SYSTEM", id: SYSTEM_ACTOR_ID },
      }),
    ).rejects.toThrow(/decided concurrently/);
    expect(mocks.ticketCreate).not.toHaveBeenCalled();
    // The loser must leave no audit row claiming it confirmed the seat.
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("checks the leg before it writes the booking, so cancelLeg cannot deadlock", async () => {
    mocks.bookingFindUnique.mockResolvedValue(
      baseBooking({ status: "AWAITING_CONFIRMATION" }),
    );

    await issueTicketsForBooking({
      bookingId: "bk-1",
      actor: { role: "SYSTEM", id: SYSTEM_ACTOR_ID },
    });

    expect(mocks.legUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.bookingUpdateMany.mock.invocationCallOrder[0],
    );
  });

  it("attributes an automated issue to SYSTEM, not to an admin", async () => {
    mocks.bookingFindUnique.mockResolvedValue(
      baseBooking({ status: "AWAITING_CONFIRMATION" }),
    );

    await issueTicketsForBooking({
      bookingId: "bk-1",
      actor: { role: "SYSTEM", id: SYSTEM_ACTOR_ID },
    });

    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userRole: "SYSTEM",
          userId: SYSTEM_ACTOR_ID,
          newState: expect.objectContaining({ automated: true }),
        }),
      }),
    );
    expect(mocks.bookingUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          availabilityDecidedById: SYSTEM_ACTOR_ID,
        }),
      }),
    );
  });

  it("does not double-issue when approve is clicked twice", async () => {
    mocks.bookingFindUnique.mockResolvedValue(
      baseBooking({
        status: "CONFIRMED",
        tickets: [
          { ticketCode: "TK-1", passengerName: "Ayu" },
          { ticketCode: "TK-2", passengerName: "Budi" },
        ],
      }),
    );

    const out = await issueTicketsForBooking({
      bookingId: "bk-1",
      actor: { role: "ADMIN", id: "admin-1" },
    });

    expect(out.alreadyIssued).toBe(true);
    expect(mocks.ticketCreate).not.toHaveBeenCalled();
  });

  it("refuses to ticket a booking that was never paid", async () => {
    mocks.bookingFindUnique.mockResolvedValue(
      baseBooking({ status: "PENDING_PAYMENT" }),
    );

    await expect(
      issueTicketsForBooking({
        bookingId: "bk-1",
        actor: { role: "ADMIN", id: "admin-1" },
      }),
    ).rejects.toThrow(/Cannot issue tickets/);
    expect(mocks.ticketCreate).not.toHaveBeenCalled();
  });
});

describe("rejectBookingAvailability", () => {
  it("cancels, opens a full refund and hands the seats back", async () => {
    mocks.bookingFindUnique.mockResolvedValue(
      baseBooking({ status: "AWAITING_CONFIRMATION" }),
    );

    const out = await rejectBookingAvailability({
      bookingId: "bk-1",
      adminId: "admin-1",
      note: "Boat not running",
    });

    expect(out.refundAmount).toBe("500000");
    expect(mocks.bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELLED_BY_OPERATOR" }),
      }),
    );
    // Full value, not the customer-cancellation tier table.
    expect(mocks.refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: "OPERATOR_CANCELLATION",
          status: "PENDING",
        }),
      }),
    );
    expect(mocks.releaseSeats).toHaveBeenCalledWith(
      "bk-1",
      "cancelled_by_operator",
    );
  });

  it("does not release seats twice on a repeated reject", async () => {
    mocks.bookingFindUnique.mockResolvedValue(
      baseBooking({
        status: "CANCELLED_BY_OPERATOR",
        refund: { refundAmount: { toString: () => "500000" } },
      }),
    );

    const out = await rejectBookingAvailability({
      bookingId: "bk-1",
      adminId: "admin-1",
    });

    expect(out.alreadyRejected).toBe(true);
    expect(mocks.refundCreate).not.toHaveBeenCalled();
    expect(mocks.releaseSeats).not.toHaveBeenCalled();
  });
});
