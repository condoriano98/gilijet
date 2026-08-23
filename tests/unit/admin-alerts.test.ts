import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  configFind: vi.fn(),
  bookingFind: vi.fn(),
  sendTemplate: vi.fn(),
  env: { ADMIN_WHATSAPP_NUMBER: "", ADMIN_ALERT_TEMPLATE: "", APP_BASE_URL: "https://gilifast.com" },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    platformConfig: { findUnique: mocks.configFind },
    booking: { findUnique: mocks.bookingFind },
  },
}));
vi.mock("@/lib/whatsapp", () => ({ sendTemplateMessage: mocks.sendTemplate }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));

import { alertAdminNewBooking, alertAdminBookingPaid } from "@/lib/admin-alerts";

const CONFIG = {
  adminWhatsappNumber: "0812 3456 7890",
  adminAlertTemplate: "gilifast_booking_alert",
  alertOnNewBooking: true,
  alertOnBookingPaid: true,
};

const BOOKING = {
  bookingReference: "BK-2026-09-ABC123",
  customerName: "Ayu Kartika",
  customerPhone: "081234000111",
  totalAmount: 500_000,
  notes: JSON.stringify({ passengers: [{ name: "A" }, { name: "B" }] }),
  leg: {
    departureDate: new Date("2026-09-03T23:00:00Z"),
    schedule: {
      originPort: "Sanur",
      destinationPort: "Nusa Penida",
      boat: { name: "Cantika 09" },
    },
  },
};

beforeEach(() => {
  mocks.configFind.mockReset().mockResolvedValue(CONFIG);
  mocks.bookingFind.mockReset().mockResolvedValue(BOOKING);
  mocks.sendTemplate.mockReset().mockResolvedValue({ delivered: true, provider: "wati" });
  mocks.env.ADMIN_WHATSAPP_NUMBER = "";
  mocks.env.ADMIN_ALERT_TEMPLATE = "";
});

describe("admin booking alerts", () => {
  it("sends a template with the booking details", async () => {
    await alertAdminBookingPaid("bk-1");

    expect(mocks.sendTemplate).toHaveBeenCalledTimes(1);
    const arg = mocks.sendTemplate.mock.calls[0][0];
    expect(arg.to).toBe("0812 3456 7890");
    expect(arg.templateName).toBe("gilifast_booking_alert");
    expect(arg.params.reference).toBe("BK-2026-09-ABC123");
    expect(arg.params.pax).toBe("2");
    expect(arg.params.route).toBe("Sanur → Nusa Penida");
  });

  it("points the paid alert at the confirmations queue", async () => {
    await alertAdminBookingPaid("bk-1");

    const p = mocks.sendTemplate.mock.calls[0][0].params;
    expect(p.event).toMatch(/PAID/);
    expect(p.action).toBe("https://gilifast.com/admin/confirmations");
  });

  it("marks an unpaid booking as needing no action yet", async () => {
    await alertAdminNewBooking("bk-1");

    const p = mocks.sendTemplate.mock.calls[0][0].params;
    expect(p.event).toMatch(/unpaid/i);
    expect(p.action).not.toMatch(/^https?:/);
  });

  it("stays silent when no number is configured anywhere", async () => {
    mocks.configFind.mockResolvedValue({ ...CONFIG, adminWhatsappNumber: null });

    await alertAdminBookingPaid("bk-1");

    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });

  it("stays silent when no template name is configured", async () => {
    // Without an approved template WhatsApp will not deliver a business-
    // initiated message at all, so sending would be pure noise in the log.
    mocks.configFind.mockResolvedValue({ ...CONFIG, adminAlertTemplate: null });

    await alertAdminBookingPaid("bk-1");

    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });

  it("falls back to env when the config row has no number", async () => {
    mocks.configFind.mockResolvedValue({
      ...CONFIG,
      adminWhatsappNumber: null,
      adminAlertTemplate: null,
    });
    mocks.env.ADMIN_WHATSAPP_NUMBER = "628999000111";
    mocks.env.ADMIN_ALERT_TEMPLATE = "env_template";

    await alertAdminBookingPaid("bk-1");

    const arg = mocks.sendTemplate.mock.calls[0][0];
    expect(arg.to).toBe("628999000111");
    expect(arg.templateName).toBe("env_template");
  });

  it("lets the database override env", async () => {
    mocks.env.ADMIN_WHATSAPP_NUMBER = "628999000111";
    mocks.env.ADMIN_ALERT_TEMPLATE = "env_template";

    await alertAdminBookingPaid("bk-1");

    const arg = mocks.sendTemplate.mock.calls[0][0];
    expect(arg.to).toBe("0812 3456 7890");
    expect(arg.templateName).toBe("gilifast_booking_alert");
  });

  it("honours the per-event toggles", async () => {
    mocks.configFind.mockResolvedValue({ ...CONFIG, alertOnNewBooking: false });

    await alertAdminNewBooking("bk-1");
    expect(mocks.sendTemplate).not.toHaveBeenCalled();

    await alertAdminBookingPaid("bk-1");
    expect(mocks.sendTemplate).toHaveBeenCalledTimes(1);
  });

  it("never throws when the database is unreachable", async () => {
    // The alert is a convenience for staff; it must not take down the booking
    // or payment that triggered it.
    mocks.configFind.mockRejectedValue(new Error("connection refused"));

    await expect(alertAdminBookingPaid("bk-1")).resolves.toBeUndefined();
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });

  it("never throws when WATI rejects the send", async () => {
    mocks.sendTemplate.mockRejectedValue(new Error("WATI 500"));

    await expect(alertAdminBookingPaid("bk-1")).resolves.toBeUndefined();
  });
});
