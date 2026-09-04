import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  bookingFind: vi.fn(),
  sendTemplate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { booking: { findUnique: mocks.bookingFind } },
}));
vi.mock("@/lib/whatsapp", () => ({ sendTemplateMessage: mocks.sendTemplate }));

import {
  alertOperatorBookingPaid,
  alertOperatorBookingConfirmed,
} from "@/lib/operator-alerts";

const BOOKING = {
  bookingReference: "BK-2026-09-ABC123",
  customerName: "Ayu Kartika",
  totalAmount: 500_000,
  notes: JSON.stringify({ passengers: [{ name: "A" }, { name: "B" }] }),
  leg: {
    departureDate: new Date("2026-09-03T23:00:00Z"),
    schedule: {
      originPort: "Sanur",
      destinationPort: "Nusa Penida",
      boat: { name: "Cantika 09", operator: { phoneNumber: "0812 3456 7890" } },
    },
  },
};

beforeEach(() => {
  mocks.bookingFind.mockReset().mockResolvedValue(BOOKING);
  mocks.sendTemplate.mockReset().mockResolvedValue({ delivered: true, provider: "wati" });
});

describe("operator booking alerts", () => {
  it("sends the paid template to the operator's phone", async () => {
    await alertOperatorBookingPaid("bk-1");

    expect(mocks.sendTemplate).toHaveBeenCalledTimes(1);
    const arg = mocks.sendTemplate.mock.calls[0][0];
    expect(arg.to).toBe("0812 3456 7890");
    expect(arg.templateName).toBe("gilifast_operator_booking_paid");
    expect(arg.params.reference).toBe("BK-2026-09-ABC123");
    expect(arg.params.pax).toBe("2");
    expect(arg.params.route).toBe("Sanur → Nusa Penida");
  });

  it("orders the paid params to match the template's positional slots", async () => {
    await alertOperatorBookingPaid("bk-1");

    const params = mocks.sendTemplate.mock.calls[0][0].params;
    expect(Object.keys(params)).toEqual([
      "route",
      "departure",
      "boat",
      "pax",
      "customer",
      "reference",
      "amount",
    ]);
    expect(params.departure).toBe("04 Sep 2026 07:00 WITA");
    expect(params.amount).toBe("Rp 500.000");
  });

  it("sends the confirmed template without customer or amount slots", async () => {
    await alertOperatorBookingConfirmed("bk-1");

    const arg = mocks.sendTemplate.mock.calls[0][0];
    expect(arg.templateName).toBe("gilifast_operator_booking_confirmed");
    expect(Object.keys(arg.params)).toEqual([
      "route",
      "departure",
      "boat",
      "pax",
      "reference",
    ]);
  });

  it("stays silent when the operator has no phone number", async () => {
    mocks.bookingFind.mockResolvedValue({
      ...BOOKING,
      leg: {
        ...BOOKING.leg,
        schedule: {
          ...BOOKING.leg.schedule,
          boat: { name: "Cantika 09", operator: { phoneNumber: null } },
        },
      },
    });

    await alertOperatorBookingPaid("bk-1");

    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });

  it("stays silent when the booking does not exist", async () => {
    mocks.bookingFind.mockResolvedValue(null);

    await alertOperatorBookingPaid("bk-1");

    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });

  it("never throws when the database is unreachable", async () => {
    mocks.bookingFind.mockRejectedValue(new Error("connection refused"));

    await expect(alertOperatorBookingPaid("bk-1")).resolves.toBeUndefined();
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });

  it("never throws when the provider rejects the send", async () => {
    mocks.sendTemplate.mockRejectedValue(new Error("Meta 500"));

    await expect(alertOperatorBookingConfirmed("bk-1")).resolves.toBeUndefined();
  });
});
