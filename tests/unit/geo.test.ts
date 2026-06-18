import { describe, it, expect } from "vitest";
import { haversineKm, nearestPorts } from "../../lib/geo";

describe("haversineKm", () => {
  it("returns 0 for the same point", () => {
    expect(haversineKm({ lat: -8.529, lng: 115.508 }, { lat: -8.529, lng: 115.508 })).toBe(0);
  });

  it("computes Bali (DPS airport) → Padang Bai ~25 km", () => {
    const dps = { lat: -8.748, lng: 115.167 };
    const padangBai = { lat: -8.529, lng: 115.508 };
    const km = haversineKm(dps, padangBai);
    expect(km).toBeGreaterThan(20);
    expect(km).toBeLessThan(45);
  });

  it("computes Padang Bai → Gili Trawangan ~60 km", () => {
    const padangBai = { lat: -8.529, lng: 115.508 };
    const giliT = { lat: -8.351, lng: 116.042 };
    const km = haversineKm(padangBai, giliT);
    expect(km).toBeGreaterThan(50);
    expect(km).toBeLessThan(80);
  });

  it("computes Labuan Bajo → Komodo Island ~50 km", () => {
    const bajo = { lat: -8.485, lng: 119.889 };
    const komodo = { lat: -8.540, lng: 119.450 };
    const km = haversineKm(bajo, komodo);
    expect(km).toBeGreaterThan(30);
    expect(km).toBeLessThan(70);
  });
});

describe("nearestPorts", () => {
  it("returns Serangan or Sanur nearest to DPS airport", () => {
    const dps = { lat: -8.748, lng: 115.167 };
    const result = nearestPorts(dps.lat, dps.lng, 3);
    expect(result.length).toBe(3);
    const names = result.map((r) => r.name);
    expect(names[0]).toBe("Serangan");
  });

  it("returns Bangsal nearest to Lombok mainland", () => {
    const lombok = { lat: -8.400, lng: 116.100 };
    const result = nearestPorts(lombok.lat, lombok.lng, 1);
    expect(result[0].name).toBe("Bangsal");
  });

  it("returns Labuan Bajo nearest to Flores", () => {
    const flores = { lat: -8.500, lng: 119.900 };
    const result = nearestPorts(flores.lat, flores.lng, 1);
    expect(result[0].name).toBe("Labuan Bajo");
  });

  it("returns results sorted by distance", () => {
    const result = nearestPorts(-8.681, 115.262, 3);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].distanceKm).toBeGreaterThanOrEqual(result[i - 1].distanceKm);
    }
  });
});
