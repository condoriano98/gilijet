import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  paymentUpdate: vi.fn(),
  captureOrder: vi.fn(),
  confirm: vi.fn(),
  configFind: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findUnique: mocks.findUnique, update: vi.fn() },
    payment: { update: mocks.paymentUpdate },
    platformConfig: { findUnique: mocks.configFind },
  },
}));

vi.mock("@/lib/paypal", () => ({
  captureOrder: mocks.captureOrder,
  createOrder: vi.fn(),
  isPaypalLive: () => true,
  paypalPresentmentCurrency: () => "USD",
  setPaypalModeOverride: vi.fn(),
}));

vi.mock("@/lib/ticket-issuer", () => ({
  recordPaymentAwaitingConfirmation: mocks.confirm,
}));

vi.mock("@/lib/booking-notifications", () => ({
  notifyPaymentReceived: vi.fn().mockResolvedValue(undefined),
}));

import { capturePaypalOrder } from "@/lib/psp";

const BOOKING = {
  id: "bk-1",
  bookingReference: "GLJ-AAA111",
  payment: {
    gatewayReference: "ORDER-OURS",
    gatewayProvider: "PAYPAL",
    presentmentAmount: "40.31",
    fxRate: "16250",
  },
};

const completedCapture = (over: Record<string, unknown> = {}) => ({
  orderId: "ORDER-OURS",
  captureId: "CAP-1",
  status: "COMPLETED",
  completed: true,
  amount: "40.31",
  currency: "USD",
  feeAmount: 1.85,
  bookingReference: "GLJ-AAA111",
  ...over,
});

describe("capturePaypalOrder", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset().mockResolvedValue(BOOKING);
    mocks.paymentUpdate.mockReset().mockResolvedValue({});
    mocks.configFind.mockReset().mockResolvedValue(null);
    mocks.captureOrder.mockReset();
    mocks.confirm
      .mockReset()
      .mockResolvedValue({ bookingReference: "GLJ-AAA111", alreadyRecorded: false });
  });

  it("captures and issues tickets on a matching completed order", async () => {
    mocks.captureOrder.mockResolvedValue(completedCapture());
    const out = await capturePaypalOrder("GLJ-AAA111");
    expect(out).toMatchObject({ ok: true, alreadyRecorded: false });
    // Fee is recorded in IDR, converted at the charge's own rate.
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "bk-1", gatewayFee: 30_063 }),
    );
  });

  it("prefers the order id PayPal echoed on the return URL", async () => {
    mocks.captureOrder.mockResolvedValue(
      completedCapture({ orderId: "ORDER-SECOND" }),
    );
    await capturePaypalOrder("GLJ-AAA111", "ORDER-SECOND");
    expect(mocks.captureOrder).toHaveBeenCalledWith("ORDER-SECOND");
  });

  it("refuses an order belonging to a different booking", async () => {
    // The ?token= on the return URL is attacker-supplied; custom_id is what
    // proves the order is ours.
    mocks.captureOrder.mockResolvedValue(
      completedCapture({ bookingReference: "GLJ-VICTIM" }),
    );
    const out = await capturePaypalOrder("GLJ-AAA111", "ORDER-SOMEONE-ELSES");
    expect(out.ok).toBe(false);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("refuses an unfamiliar order id that carries no booking reference", async () => {
    mocks.captureOrder.mockResolvedValue(
      completedCapture({ bookingReference: null }),
    );
    const out = await capturePaypalOrder("GLJ-AAA111", "ORDER-UNKNOWN");
    expect(out.ok).toBe(false);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("refuses a capture whose amount differs from the quote", async () => {
    mocks.captureOrder.mockResolvedValue(completedCapture({ amount: "1.00" }));
    const out = await capturePaypalOrder("GLJ-AAA111");
    expect(out).toMatchObject({ ok: false, reason: "Amount mismatch" });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("does not issue tickets when the capture is not completed", async () => {
    mocks.captureOrder.mockResolvedValue(
      completedCapture({ status: "PENDING", completed: false }),
    );
    const out = await capturePaypalOrder("GLJ-AAA111");
    expect(out.ok).toBe(false);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("reports a gateway error without issuing tickets", async () => {
    mocks.captureOrder.mockRejectedValue(new Error("PayPal 500"));
    const out = await capturePaypalOrder("GLJ-AAA111");
    expect(out).toMatchObject({ ok: false, reason: "Capture failed" });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("passes a repeat capture through as already issued", async () => {
    mocks.captureOrder.mockResolvedValue(completedCapture());
    mocks.confirm.mockResolvedValue({
      bookingReference: "GLJ-AAA111",
      alreadyRecorded: true,
    });
    const out = await capturePaypalOrder("GLJ-AAA111");
    expect(out).toMatchObject({ ok: true, alreadyRecorded: true });
  });

  it("refuses when the booking was not paid through PayPal", async () => {
    mocks.findUnique.mockResolvedValue({
      ...BOOKING,
      payment: { ...BOOKING.payment, gatewayProvider: "MIDTRANS" },
    });
    const out = await capturePaypalOrder("GLJ-AAA111");
    expect(out.ok).toBe(false);
    expect(mocks.captureOrder).not.toHaveBeenCalled();
  });
});
