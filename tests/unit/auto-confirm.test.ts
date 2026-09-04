import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  issue: vi.fn(),
  notify: vi.fn(),
  env: { CRON_SECRET: "s3cret", AUTO_CONFIRM_ENABLED: true } as {
    CRON_SECRET?: string;
    AUTO_CONFIRM_ENABLED: boolean;
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: { booking: { findMany: mocks.findMany, update: mocks.update } },
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/booking-notifications", () => ({
  notifyBoardingPassIssued: mocks.notify,
}));
vi.mock("@/lib/ticket-issuer", () => ({
  issueTicketsForBooking: mocks.issue,
  SYSTEM_ACTOR_ID: "system:auto-confirm",
}));
vi.mock("@/lib/qr", () => ({
  buildQrPayload: (code: string) => `qr:${code}`,
}));

import { GET } from "@/app/api/cron/auto-confirm/route";

const req = (auth?: string) =>
  ({ headers: { get: () => auth ?? null } }) as unknown as Parameters<
    typeof GET
  >[0];

const candidate = (id: string) => ({ id, bookingReference: `GLJ-${id}` });

const issued = (id: string) => ({
  bookingReference: `GLJ-${id}`,
  alreadyIssued: false,
  tickets: [{ ticketCode: "TK-1", passengerName: "Ayu", qrPayload: "qr:TK-1" }],
});

beforeEach(() => {
  mocks.findMany.mockReset();
  mocks.update.mockReset();
  mocks.issue.mockReset();
  mocks.notify.mockReset();
  mocks.env.CRON_SECRET = "s3cret";
  mocks.env.AUTO_CONFIRM_ENABLED = true;
  mocks.update.mockResolvedValue({});
  mocks.notify.mockResolvedValue(undefined);
  // Pass A candidates, then Pass B repair — empty unless a test overrides.
  mocks.findMany.mockResolvedValue([]);
});

describe("auto-confirm cron auth", () => {
  it("401s without a bearer token", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("401s with the wrong bearer token", async () => {
    const res = await GET(req("Bearer nope"));
    expect(res.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("401s when CRON_SECRET is unset, rather than running open", async () => {
    mocks.env.CRON_SECRET = undefined;
    const res = await GET(req("Bearer undefined"));
    expect(res.status).toBe(401);
  });
});

describe("auto-confirm kill switch", () => {
  it("does nothing at all when AUTO_CONFIRM_ENABLED is off", async () => {
    mocks.env.AUTO_CONFIRM_ENABLED = false;

    const res = await GET(req("Bearer s3cret"));

    expect(await res.json()).toMatchObject({ ok: true, disabled: true });
    // The switch has to bite before any query runs, not just before the send.
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});

describe("auto-confirm sweep", () => {
  it("only considers legs that are OPEN or FULL and not yet departed", async () => {
    await GET(req("Bearer s3cret"));

    const where = mocks.findMany.mock.calls[0][0].where;
    // FULL is the normal case for a boat this booking filled — excluding it
    // would strand exactly the bookings that sold out a departure.
    expect(where.leg.status).toEqual({ in: ["OPEN", "FULL"] });
    expect(where.status).toBe("AWAITING_CONFIRMATION");
    expect(where.payment).toMatchObject({ status: "SUCCESSFUL" });
    expect(where.refund).toBeNull();
    expect(where.leg.schedule).toMatchObject({
      status: "ACTIVE",
      deletedAt: null,
      boat: { status: "ACTIVE", deletedAt: null },
    });
  });

  it("issues, sends and stamps the booking", async () => {
    mocks.findMany.mockResolvedValueOnce([candidate("a")]).mockResolvedValueOnce([]);
    mocks.issue.mockResolvedValue(issued("a"));

    const res = await GET(req("Bearer s3cret"));

    expect(await res.json()).toMatchObject({ ok: true, issued: 1, failed: 0 });
    expect(mocks.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { role: "SYSTEM", id: "system:auto-confirm" },
      }),
    );
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { boardingPassSentAt: expect.any(Date) },
      }),
    );
  });

  it("does not re-send when it lost the race to an admin click", async () => {
    mocks.findMany.mockResolvedValueOnce([candidate("a")]).mockResolvedValueOnce([]);
    mocks.issue.mockResolvedValue({ ...issued("a"), alreadyIssued: true });

    const res = await GET(req("Bearer s3cret"));

    expect(await res.json()).toMatchObject({ issued: 0 });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("keeps going when one booking is refused, leaving it for a human", async () => {
    mocks.findMany
      .mockResolvedValueOnce([candidate("a"), candidate("b"), candidate("c")])
      .mockResolvedValueOnce([]);
    mocks.issue
      .mockResolvedValueOnce(issued("a"))
      .mockRejectedValueOnce(new Error("departure is cancelled"))
      .mockResolvedValueOnce(issued("c"));

    const res = await GET(req("Bearer s3cret"));

    expect(await res.json()).toMatchObject({ issued: 2, failed: 1, total: 3 });
  });
});

describe("auto-confirm repair pass", () => {
  it("scopes the repair to bookings the sweep itself confirmed", async () => {
    await GET(req("Bearer s3cret"));

    const where = mocks.findMany.mock.calls[1][0].where;
    // Without this filter, `db push` adding a NULL column would make the first
    // tick re-mail the entire back catalogue of CONFIRMED bookings.
    expect(where.availabilityDecidedById).toBe("system:auto-confirm");
    expect(where.status).toBe("CONFIRMED");
    expect(where.boardingPassSentAt).toBeNull();
  });

  it("re-sends a pass that was minted but never delivered", async () => {
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "bk-x",
        bookingReference: "GLJ-X",
        leg: { departureDate: new Date("2026-09-01T02:00:00Z") },
        tickets: [{ ticketCode: "TK-9", passengerName: "Budi" }],
      },
    ]);

    const res = await GET(req("Bearer s3cret"));

    expect(await res.json()).toMatchObject({ repaired: 1 });
    expect(mocks.notify).toHaveBeenCalledWith("bk-x", [
      { ticketCode: "TK-9", passengerName: "Budi", qrPayload: "qr:TK-9" },
    ]);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "bk-x" } }),
    );
  });
});
