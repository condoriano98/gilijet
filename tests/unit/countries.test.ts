import { describe, it, expect } from "vitest";
import { composePhone } from "@/lib/countries";

describe("composePhone", () => {
  it("keeps a bare local number", () => {
    expect(composePhone("+62", "81234567890")).toBe("+6281234567890");
  });

  it("drops a leading national zero", () => {
    expect(composePhone("+62", "081234567890")).toBe("+6281234567890");
  });

  it("does not double the dial code when the user already typed it", () => {
    expect(composePhone("+62", "625161244001")).toBe("+625161244001");
    expect(composePhone("+62", "+6281234567890")).toBe("+6281234567890");
  });

  it("strips the 00 international prefix before the dial code", () => {
    expect(composePhone("+62", "00625161244001")).toBe("+625161244001");
  });
});
