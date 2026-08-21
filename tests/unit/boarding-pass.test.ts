import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: { booking: { findUnique: mocks.findUnique } },
}));

vi.mock("@/lib/env", () => ({
  env: { QR_HMAC_SECRET: "test-secret-at-least-32-chars-long-ok" },
}));

import {
  generateBoardingPassPdf,
  boardingPassFilename,
  orderPassengerTickets,
} from "@/lib/boarding-pass";

const ticket = (code: string, name: string) => ({
  ticketCode: code,
  passengerName: name,
  passengerIdNumber: null,
});

const booking = (over: Record<string, unknown> = {}) => ({
  bookingReference: "BK-2026-09-ABC123",
  customerName: "Ayu Kartika",
  status: "CONFIRMED",
  totalAmount: 450_000,
  tickets: [ticket("TK-2026-09-ABC123-1", "Ayu Kartika")],
  leg: {
    departureDate: new Date("2026-09-03T23:00:00Z"),
    schedule: {
      originPort: "Sanur",
      destinationPort: "Nusa Penida",
      durationMinutes: 45,
      boat: {
        name: "Cantika 09",
        operator: {
          companyName: "PT WAHANA VIRENDRA GROUP",
          phoneNumber: "+62 859-5376-4142",
        },
      },
    },
  },
  ...over,
});

beforeEach(() => mocks.findUnique.mockReset());

describe("generateBoardingPassPdf", () => {
  it("renders a real PDF for a confirmed booking", async () => {
    mocks.findUnique.mockResolvedValue(booking());

    const pdf = await generateBoardingPassPdf("BK-2026-09-ABC123");

    expect(pdf).not.toBeNull();
    // %PDF- magic, so this is a real document rather than an empty buffer.
    expect(pdf!.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf!.length).toBeGreaterThan(1000);
  });

  it("refuses a booking that is paid but not yet confirmed", async () => {
    // Tickets present but status not CONFIRMED: the gate is the status, so a
    // booking still waiting on the operator call cannot produce a pass early.
    mocks.findUnique.mockResolvedValue(
      booking({ status: "AWAITING_CONFIRMATION" }),
    );

    expect(await generateBoardingPassPdf("BK-2026-09-ABC123")).toBeNull();
  });

  it("refuses a cancelled booking", async () => {
    mocks.findUnique.mockResolvedValue(
      booking({ status: "CANCELLED_BY_OPERATOR" }),
    );

    expect(await generateBoardingPassPdf("BK-2026-09-ABC123")).toBeNull();
  });

  it("returns null rather than throwing for an unknown reference", async () => {
    mocks.findUnique.mockResolvedValue(null);

    expect(await generateBoardingPassPdf("BK-NOPE")).toBeNull();
  });

  it("returns null when a confirmed booking somehow has no tickets", async () => {
    mocks.findUnique.mockResolvedValue(booking({ tickets: [] }));

    expect(await generateBoardingPassPdf("BK-2026-09-ABC123")).toBeNull();
  });

  it("renders a multi-passenger booking without throwing", async () => {
    mocks.findUnique.mockResolvedValue(
      booking({
        tickets: [
          ticket("TK-2026-09-ABC123-1", "Ayu Kartika"),
          ticket("TK-2026-09-ABC123-2", "Budi Santoso"),
          ticket("TK-2026-09-ABC123-3", "Made Wirawan"),
        ],
      }),
    );

    const pdf = await generateBoardingPassPdf("BK-2026-09-ABC123");

    expect(pdf!.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("orderPassengerTickets", () => {
  // The PDF compresses its text streams, so passenger order is asserted on the
  // sort itself rather than by grepping the rendered bytes.
  it("puts passenger 10 after passenger 2, not before it", () => {
    const ordered = orderPassengerTickets([
      { ticketCode: "TK-2026-09-ABC123-10" },
      { ticketCode: "TK-2026-09-ABC123-2" },
      { ticketCode: "TK-2026-09-ABC123-1" },
    ]);

    expect(ordered.map((t) => t.ticketCode)).toEqual([
      "TK-2026-09-ABC123-1",
      "TK-2026-09-ABC123-2",
      "TK-2026-09-ABC123-10",
    ]);
  });

  it("does not mutate the array it was given", () => {
    const input = [
      { ticketCode: "TK-2026-09-ABC123-2" },
      { ticketCode: "TK-2026-09-ABC123-1" },
    ];

    orderPassengerTickets(input);

    expect(input[0].ticketCode).toBe("TK-2026-09-ABC123-2");
  });

  it("leaves codes with no numeric tail in a stable position", () => {
    const ordered = orderPassengerTickets([
      { ticketCode: "TK-2026-09-ABC123-1" },
      { ticketCode: "LEGACY-CODE" },
    ]);

    expect(ordered[0].ticketCode).toBe("LEGACY-CODE");
  });
});

describe("boardingPassFilename", () => {
  it("names the file after the booking so a saved copy is identifiable", () => {
    expect(boardingPassFilename("BK-2026-09-ABC123")).toBe(
      "Gilifast-BK-2026-09-ABC123.pdf",
    );
  });
});
