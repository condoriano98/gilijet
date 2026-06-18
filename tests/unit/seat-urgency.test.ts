import { describe, it, expect } from "vitest";
import { seatUrgency } from "../../lib/seat-urgency";

describe("seatUrgency", () => {
  it("returns destructive for 1-3 seats", () => {
    expect(seatUrgency(1)?.tone).toBe("destructive");
    expect(seatUrgency(3)?.tone).toBe("destructive");
    expect(seatUrgency(1)?.label).toBe("Only 1 left");
  });

  it("returns warning for 4-10 seats", () => {
    expect(seatUrgency(4)?.tone).toBe("warning");
    expect(seatUrgency(10)?.tone).toBe("warning");
    expect(seatUrgency(7)?.label).toBe("7 seats left");
  });

  it("returns success for 11-30 seats", () => {
    expect(seatUrgency(11)?.tone).toBe("success");
    expect(seatUrgency(30)?.tone).toBe("success");
  });

  it("returns null for >30 seats", () => {
    expect(seatUrgency(31)).toBeNull();
    expect(seatUrgency(80)).toBeNull();
  });
});
