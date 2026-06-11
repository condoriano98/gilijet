import { describe, it, expect } from "vitest";
import { newBookingReference, newTicketCode } from "@/lib/references";

describe("newBookingReference", () => {
  it("starts with BK- followed by year-month", () => {
    const ref = newBookingReference(new Date("2026-06-15T00:00:00Z"));
    expect(ref).toMatch(/^BK-2026-06-[A-Z2-9]{6}$/);
  });

  it("produces 17-character strings", () => {
    const ref = newBookingReference();
    expect(ref.length).toBe(17);
  });

  it("suffix contains only allowed characters (no I,O,0,1)", () => {
    for (let i = 0; i < 20; i++) {
      const ref = newBookingReference();
      const suffix = ref.slice(-6);
      expect(suffix).not.toMatch(/[IO01]/);
    }
  });

  it("does not produce empty string", () => {
    expect(newBookingReference().length).toBeGreaterThan(0);
  });
});

describe("newTicketCode", () => {
  it("prepends TK- to the booking suffix and appends index", () => {
    const code = newTicketCode("BK-2026-06-ABC3F5", 1);
    expect(code).toBe("TK-2026-06-ABC3F5-1");
  });

  it("handles index > 9", () => {
    const code = newTicketCode("BK-2026-06-ABC3F5", 10);
    expect(code).toBe("TK-2026-06-ABC3F5-10");
  });

  it("handles references without BK- prefix", () => {
    const code = newTicketCode("FOO-2026-06-BAR", 1);
    expect(code).toBe("TK-FOO-2026-06-BAR-1");
  });
});
