import { describe, it, expect } from "vitest";
import { WAHANA_DEPARTURES } from "@/lib/wahana-schedule";
import { parseFareMatrix, baseFareOf } from "@/lib/fares";
import { canonicalPortName, getAllPorts } from "@/lib/port-info";

/**
 * lib/wahana-schedule.ts is generated from the operator's price sheet, so these
 * assert the properties the import depends on rather than restating the file.
 * A bad regeneration is a wrong price on a live booking.
 */
describe("Wahana price sheet", () => {
  it("collapses the 432 price rows into 24 physical departures", () => {
    expect(WAHANA_DEPARTURES).toHaveLength(24);
    const keys = WAHANA_DEPARTURES.map(
      (d) => `${d.boat}|${d.origin}|${d.destination}|${d.departureTime}`,
    );
    expect(new Set(keys).size).toBe(24);
  });

  it("names only ports the app can describe, in canonical form", () => {
    const known = new Set(getAllPorts().map((p) => p.name));
    for (const d of WAHANA_DEPARTURES) {
      for (const port of [
        d.origin,
        d.destination,
        ...d.transitStops.map((s) => s.portName),
      ]) {
        // A decorated name like "Sanur (Bali)" would create a route no
        // customer could search for.
        expect(canonicalPortName(port), `${port} is not canonical`).toBe(port);
        expect(known.has(port), `${port} missing from port-info`).toBe(true);
      }
    }
  });

  it("carries a complete fare matrix whose base cell matches basePrice", () => {
    for (const d of WAHANA_DEPARTURES) {
      const matrix = parseFareMatrix(d.fares);
      expect(matrix, `${d.boat} ${d.origin}->${d.destination}`).not.toBeNull();
      // basePrice is what actually gets charged today; if it drifts from the
      // matrix the stored sheet and the till disagree.
      expect(baseFareOf(matrix!)).toBe(d.basePrice);
    }
  });

  it("prices rise from low to high to peak, and infants travel free", () => {
    for (const d of WAHANA_DEPARTURES) {
      const { oneWay, return: ret } = d.fares;
      expect(oneWay.low.adult).toBeLessThanOrEqual(oneWay.high.adult);
      expect(oneWay.high.adult).toBeLessThanOrEqual(oneWay.peak.adult);
      expect(oneWay.low.infant).toBe(0);
      // A return that costs less than a single would be a transcription error.
      expect(ret.low.adult).toBeGreaterThan(oneWay.low.adult);
    }
  });

  it("keeps the known Sanur and Padang Bai fares from the sheet", () => {
    const sanur = WAHANA_DEPARTURES.find(
      (d) => d.origin === "Sanur" && d.departureTime === "07:00",
    );
    expect(sanur?.basePrice).toBe(150_000);
    expect(sanur?.fares.oneWay.peak.adult).toBe(200_000);
    expect(sanur?.fares.oneWay.low.child).toBe(110_000);

    const gili = WAHANA_DEPARTURES.find(
      (d) => d.origin === "Padang Bai" && d.destination === "Gili Trawangan",
    );
    expect(gili?.basePrice).toBe(450_000);
    expect(gili?.fares.return.peak.adult).toBe(1_360_000);
  });

  it("times every transit stop between its departure and arrival", () => {
    const withStops = WAHANA_DEPARTURES.filter((d) => d.transitStops.length > 0);
    expect(withStops.length).toBeGreaterThan(0);
    for (const d of withStops) {
      for (const stop of d.transitStops) {
        // Derived from sibling rows on the same sailing — never interpolated,
        // so an out-of-range time means the derivation broke.
        expect(stop.time > d.departureTime, `${stop.portName} before departure`).toBe(true);
        expect(stop.time < d.arrivalTime, `${stop.portName} after arrival`).toBe(true);
      }
    }
  });

  it("sails every day, with a duration matching the timetable", () => {
    for (const d of WAHANA_DEPARTURES) {
      expect(d.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6, 7]);
      const mins = (t: string) =>
        Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      expect(Math.abs(mins(d.arrivalTime) - mins(d.departureTime) - d.durationMinutes)).toBeLessThanOrEqual(1);
    }
  });
});

describe("parseFareMatrix", () => {
  const full = {
    oneWay: {
      low: { adult: 150000, child: 110000, infant: 0 },
      high: { adult: 170000, child: 125000, infant: 0 },
      peak: { adult: 200000, child: 150000, infant: 0 },
    },
    return: {
      low: { adult: 290000, child: 210000, infant: 0 },
      high: { adult: 325000, child: 235000, infant: 0 },
      peak: { adult: 380000, child: 280000, infant: 0 },
    },
  };

  it("accepts a complete matrix, including free infants", () => {
    expect(parseFareMatrix(full)).toEqual(full);
  });

  it("rejects a partial matrix rather than returning half of one", () => {
    const noPeak = JSON.parse(JSON.stringify(full));
    delete noPeak.oneWay.peak;
    expect(parseFareMatrix(noPeak)).toBeNull();

    const noReturn = JSON.parse(JSON.stringify(full));
    delete noReturn.return;
    expect(parseFareMatrix(noReturn)).toBeNull();
  });

  it("rejects unusable numbers", () => {
    for (const bad of [-1, Number.NaN, "150000", null]) {
      const broken = JSON.parse(JSON.stringify(full));
      broken.oneWay.low.adult = bad;
      expect(parseFareMatrix(broken)).toBeNull();
    }
  });

  it("returns null for junk instead of throwing", () => {
    for (const junk of [null, undefined, 42, "matrix", []]) {
      expect(parseFareMatrix(junk)).toBeNull();
    }
  });
});

describe("canonicalPortName", () => {
  it("strips the region a price sheet decorates ports with", () => {
    expect(canonicalPortName("Sanur (Bali)")).toBe("Sanur");
    expect(canonicalPortName("Padangbai (Bali)")).toBe("Padang Bai");
    expect(canonicalPortName("Senggigi (Lombok)")).toBe("Senggigi");
  });

  it("leaves an already-canonical name alone and is case-insensitive", () => {
    expect(canonicalPortName("Nusa Penida")).toBe("Nusa Penida");
    expect(canonicalPortName("gili trawangan")).toBe("Gili Trawangan");
    expect(canonicalPortName("  Padang Bai  ")).toBe("Padang Bai");
  });

  it("passes through an unknown port rather than dropping it", () => {
    expect(canonicalPortName("Amed")).toBe("Amed");
  });
});
