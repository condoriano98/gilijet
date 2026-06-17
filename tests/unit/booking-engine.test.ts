import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        leg: { findUnique: findUniqueMock },
      }),
  },
}));

import { reserveSeatsAndCreateBooking, BookingError } from "@/lib/booking-engine";

describe("reserveSeatsAndCreateBooking tenant invariant", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it("rejects when leg.operatorId disagrees with schedule.boat.operatorId", async () => {
    findUniqueMock.mockResolvedValue({
      id: "leg-1",
      operatorId: "op-A",
      status: "OPEN",
      availableSeats: 10,
      departureDate: new Date(Date.now() + 86_400_000),
      basePrice: 250_000,
      schedule: { boat: { operatorId: "op-B" } },
    });

    await expect(
      reserveSeatsAndCreateBooking({
        legId: "leg-1",
        customer: {
          name: "Test",
          email: "t@example.com",
          phone: "+62000",
        },
        passengers: [{ name: "Test", type: "ADULT" }],
      }),
    ).rejects.toMatchObject({
      name: "BookingError",
      code: "INVALID_INPUT",
    });

    await expect(
      reserveSeatsAndCreateBooking({
        legId: "leg-1",
        customer: {
          name: "Test",
          email: "t@example.com",
          phone: "+62000",
        },
        passengers: [{ name: "Test", type: "ADULT" }],
      }),
    ).rejects.toBeInstanceOf(BookingError);
  });
});
