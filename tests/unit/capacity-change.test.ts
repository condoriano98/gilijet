import { describe, it, expect } from "vitest";
import { planCapacityChange } from "@/lib/legs";

/**
 * Resizing a departure from the admin operations desk.
 *
 * `availableSeats` cannot be derived from capacity alone — the gap between it
 * and `totalCapacity` is what has already been sold — so a resize must move
 * both or seats appear and vanish. Shrinking below what is booked is refused
 * rather than clamped, because clamping would report success while overselling
 * the boat.
 */

const leg = (totalCapacity: number, availableSeats: number) => ({
  totalCapacity,
  availableSeats,
});

describe("planCapacityChange", () => {
  it("grows capacity and gives the new seats to availability", () => {
    // 40 seats, 10 sold -> 50 seats, still 10 sold
    const r = planCapacityChange(leg(40, 30), 50);
    expect(r).toEqual({ ok: true, totalCapacity: 50, availableSeats: 40 });
  });

  it("shrinks capacity while preserving seats already sold", () => {
    const r = planCapacityChange(leg(40, 30), 20);
    expect(r).toEqual({ ok: true, totalCapacity: 20, availableSeats: 10 });
  });

  it("allows shrinking to exactly the number booked", () => {
    const r = planCapacityChange(leg(40, 30), 10);
    expect(r).toEqual({ ok: true, totalCapacity: 10, availableSeats: 0 });
  });

  it("refuses to shrink below seats already booked", () => {
    const r = planCapacityChange(leg(40, 30), 9);
    expect(r).toEqual({ ok: false, booked: 10 });
  });

  it("refuses a sold-out boat being shrunk at all", () => {
    const r = planCapacityChange(leg(40, 0), 39);
    expect(r).toEqual({ ok: false, booked: 40 });
  });

  it("handles an empty departure", () => {
    const r = planCapacityChange(leg(40, 40), 0);
    expect(r).toEqual({ ok: true, totalCapacity: 0, availableSeats: 0 });
  });

  it("never lets booked seats exceed capacity, across a sweep", () => {
    for (let total = 0; total <= 60; total += 5) {
      for (let avail = 0; avail <= total; avail += 5) {
        const booked = total - avail;
        for (let next = 0; next <= 80; next += 5) {
          const r = planCapacityChange(leg(total, avail), next);
          if (!r.ok) {
            expect(next).toBeLessThan(booked);
            continue;
          }
          // Seats sold are untouched by a resize, and never exceed capacity.
          expect(r.totalCapacity - r.availableSeats).toBe(booked);
          expect(r.availableSeats).toBeGreaterThanOrEqual(0);
          expect(r.availableSeats).toBeLessThanOrEqual(r.totalCapacity);
        }
      }
    }
  });
});
