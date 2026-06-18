import { describe, it, expect } from "vitest";
import { isSailable } from "../../lib/weather-policy";

describe("isSailable", () => {
  it("returns SAFE for calm conditions", () => {
    const result = isSailable({ waveHeightM: 0.5, windKnots: 10 });
    expect(result.sailable).toBe(true);
    expect(result.level).toBe("SAFE");
    expect(result.warning).toBeUndefined();
  });

  it("returns BORDERLINE for moderate conditions", () => {
    const result = isSailable({ waveHeightM: 1.8, windKnots: 22 });
    expect(result.sailable).toBe(true);
    expect(result.level).toBe("BORDERLINE");
    expect(result.warning).toBeDefined();
  });

  it("returns UNSAFE for high waves", () => {
    const result = isSailable({ waveHeightM: 3.0, windKnots: 15 });
    expect(result.sailable).toBe(false);
    expect(result.level).toBe("UNSAFE");
  });

  it("returns UNSAFE for high winds", () => {
    const result = isSailable({ waveHeightM: 1.0, windKnots: 30 });
    expect(result.sailable).toBe(false);
    expect(result.level).toBe("UNSAFE");
  });

  it("returns SAFE for null values", () => {
    const result = isSailable({ waveHeightM: null, windKnots: null });
    expect(result.sailable).toBe(true);
    expect(result.level).toBe("SAFE");
  });

  it("returns UNSAFE at exact threshold", () => {
    const result = isSailable({ waveHeightM: 2.6, windKnots: 26 });
    expect(result.sailable).toBe(false);
    expect(result.level).toBe("UNSAFE");
  });
});
