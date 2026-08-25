/**
 * Generate lib/wahana-schedule.ts from the CSV price sheet.
 *
 * Usage:
 *   pnpm gen:wahana
 */

import fs from "fs";
import path from "path";

type PriceRow = {
  PRICE_CODE: string;
  name: string;
  originPort: string;
  destinationPort: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: string;
  TRANSIT: string;
  basePrice: string;
  CATEGORY: string;
  CLASS: string;
  SEASON: string;
  daysOfWeeks: string;
};

type Departure = {
  priceCodes: string[];
  boat: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  daysOfWeek: number[];
  transitStops: { portName: string; time: string }[];
  basePrice: number;
  fares: {
    oneWay: {
      low: { adult: number; child: number; infant: number };
      high: { adult: number; child: number; infant: number };
      peak: { adult: number; child: number; infant: number };
    };
    return: {
      low: { adult: number; child: number; infant: number };
      high: { adult: number; child: number; infant: number };
      peak: { adult: number; child: number; infant: number };
    };
  };
};

function parsePortName(portWithRegion: string): string {
  return portWithRegion.split(" - ")[0]!.trim();
}

function parseDaysOfWeek(daysStr: string): number[] {
  if (!daysStr) return [1, 2, 3, 4, 5, 6, 7];
  const matches = daysStr.match(/\d+/g) || [];
  return matches.map((d) => parseInt(d, 10));
}

function parseTransitStops(transitStr: string): { portName: string; time: string }[] {
  if (!transitStr || transitStr === "Direct") return [];
  return transitStr
    .split(",")
    .map((s) => {
      const [port, time] = s.trim().split("@");
      if (!port || !time) return null;
      return { portName: port.trim(), time: time.trim() };
    })
    .filter((x) => x !== null) as { portName: string; time: string }[];
}

function parseCSV(content: string): PriceRow[] {
  const lines = content.split("\n");
  const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"(.*)"$/, "$1"));
  const rows: PriceRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    // Simple CSV parser that handles quoted fields
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        if (inQuotes && line[j + 1] === '"') {
          current += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        fields.push(current.trim().replace(/^"(.*)"$/, "$1"));
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim().replace(/^"(.*)"$/, "$1"));

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length && j < fields.length; j++) {
      row[headers[j]!] = fields[j] || "";
    }

    rows.push(row as PriceRow);
  }

  return rows;
}

async function main() {
  const csvPath = path.join(process.cwd(), "price_schedule_pt wahana virendra group.csv");
  const outputPath = path.join(process.cwd(), "lib", "wahana-schedule.ts");

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found at ${csvPath}`);
  }

  const content = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(content);

  // Group by unique departure (boat, origin, destination, departure time)
  const departures = new Map<string, { rows: PriceRow[]; key: string }>();

  for (const row of rows) {
    const origin = parsePortName(row.originPort);
    const destination = parsePortName(row.destinationPort);
    const key = `${row.name}|${origin}|${destination}|${row.departureTime}`;

    if (!departures.has(key)) {
      departures.set(key, { rows: [], key });
    }
    departures.get(key)!.rows.push(row);
  }

  const result: Departure[] = [];

  for (const { rows, key } of departures.values()) {
    const first = rows[0]!;
    const origin = parsePortName(first.originPort);
    const destination = parsePortName(first.destinationPort);

    // Collect all price codes
    const priceCodes = rows.map((r) => r.PRICE_CODE);

    // Extract fares by category and season
    const faresByKey = new Map<string, number>();

    // Build fares matrix from the rows - only use Adult/Child/Infant rows
    for (const row of rows) {
      // Skip non-standard category rows
      if (!["Adult", "Child", "Infant"].includes(row.CATEGORY)) {
        continue;
      }

      const tripType = row.TRIP === "One Way" ? "oneWay" : "return";
      const season = row.SEASON.toLowerCase() as "low" | "high" | "peak";
      const category = row.CATEGORY.toLowerCase() as "adult" | "child" | "infant";
      const key = `${tripType}|${season}|${category}`;

      const price = parseInt(row.basePrice.replace(/,/g, ""), 10);
      if (!faresByKey.has(key)) {
        faresByKey.set(key, price);
      }
    }

    // Build fares matrix with all combinations
    const fares = {
      oneWay: {
        low: {
          adult: faresByKey.get("oneWay|low|adult") || 0,
          child: faresByKey.get("oneWay|low|child") || 0,
          infant: faresByKey.get("oneWay|low|infant") || 0,
        },
        high: {
          adult: faresByKey.get("oneWay|high|adult") || 0,
          child: faresByKey.get("oneWay|high|child") || 0,
          infant: faresByKey.get("oneWay|high|infant") || 0,
        },
        peak: {
          adult: faresByKey.get("oneWay|peak|adult") || 0,
          child: faresByKey.get("oneWay|peak|child") || 0,
          infant: faresByKey.get("oneWay|peak|infant") || 0,
        },
      },
      return: {
        low: {
          adult: faresByKey.get("return|low|adult") || 0,
          child: faresByKey.get("return|low|child") || 0,
          infant: faresByKey.get("return|low|infant") || 0,
        },
        high: {
          adult: faresByKey.get("return|high|adult") || 0,
          child: faresByKey.get("return|high|child") || 0,
          infant: faresByKey.get("return|high|infant") || 0,
        },
        peak: {
          adult: faresByKey.get("return|peak|adult") || 0,
          child: faresByKey.get("return|peak|child") || 0,
          infant: faresByKey.get("return|peak|infant") || 0,
        },
      },
    };

    // Pad departure and arrival times to HH:MM format
    const [depHours, depMins] = first.departureTime.split(":");
    const paddedDepartureTime = `${depHours?.padStart(2, "0")}:${depMins}`;
    const [arrHours, arrMins] = first.arrivalTime.split(":");
    const paddedArrivalTime = `${arrHours?.padStart(2, "0")}:${arrMins}`;

    const departure: Departure = {
      priceCodes,
      boat: first.name,
      origin,
      destination,
      departureTime: paddedDepartureTime,
      arrivalTime: paddedArrivalTime,
      durationMinutes: parseInt(first.durationMinutes, 10),
      daysOfWeek: parseDaysOfWeek(first.daysOfWeeks),
      transitStops: parseTransitStops(first.TRANSIT),
      basePrice: parseInt(first.basePrice.replace(/,/g, ""), 10),
      fares,
    };

    result.push(departure);
  }

  // Sort by boat, then origin, then destination, then time
  result.sort((a, b) => {
    if (a.boat !== b.boat) return a.boat.localeCompare(b.boat);
    if (a.origin !== b.origin) return a.origin.localeCompare(b.origin);
    if (a.destination !== b.destination) return a.destination.localeCompare(b.destination);
    return a.departureTime.localeCompare(b.departureTime);
  });

  // Generate TS file
  const tsContent = `// GENERATED from the operator's price sheet
// (price_schedule_pt_wahana_virendra_group.csv, ${rows.length} rows -> ${result.length} departures).
// Do not hand-edit: re-run scripts/generate-wahana-schedule.ts instead.

import type { FareMatrix } from "@/lib/fares";

export type WahanaDeparture = {
  /** PRICE_CODE values this departure was collapsed from, for traceability. */
  priceCodes: string[];
  boat: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  daysOfWeek: number[];
  /** Intermediate calls, timed from sibling rows on the same sailing. */
  transitStops: { portName: string; time: string }[];
  /** Adult, low season, one way — the only fare Schedule.basePrice can hold. */
  basePrice: number;
  fares: FareMatrix;
};

export const WAHANA_OPERATOR = "PT WAHANA VIRENDRA GROUP";

export const WAHANA_DEPARTURES: WahanaDeparture[] = ${JSON.stringify(result, null, 2)};
`;

  fs.writeFileSync(outputPath, tsContent);
  console.log(`✓ Generated ${outputPath} with ${result.length} departures from ${rows.length} rows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
