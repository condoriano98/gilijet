/**
 * Static sea-condition lookup per route. Indonesian boat tourism depends
 * heavily on weather windows; even a calm/moderate badge sets expectations.
 *
 * TODO: replace with live BMKG (Indonesia's met agency) feed in lib/weather.ts.
 * Until then, this is keyed by canonical route name (order-agnostic).
 */

export type SeaCondition = "CALM" | "MODERATE" | "ROUGH";

export type RouteCondition = {
  condition: SeaCondition;
  label: string;
  /** Used to style badge variant. */
  tone: "success" | "warning" | "destructive";
};

const ROUTE_CONDITIONS: Record<string, RouteCondition> = {
  // Bali ↔ Nusa Penida / Lembongan — short, sheltered crossings.
  "Sanur|Nusa Penida": {
    condition: "CALM",
    label: "Calm seas",
    tone: "success",
  },
  "Sanur|Nusa Lembongan": {
    condition: "CALM",
    label: "Calm seas",
    tone: "success",
  },
  // Padang Bai ↔ Gilis — Lombok Strait, often moderate swell.
  "Padang Bai|Gili Trawangan": {
    condition: "MODERATE",
    label: "Moderate swell",
    tone: "warning",
  },
  "Padang Bai|Gili Air": {
    condition: "MODERATE",
    label: "Moderate swell",
    tone: "warning",
  },
  // Bangsal ↔ Gilis — short hops, almost always calm.
  "Bangsal|Gili Trawangan": {
    condition: "CALM",
    label: "Calm seas",
    tone: "success",
  },
  "Bangsal|Gili Air": {
    condition: "CALM",
    label: "Calm seas",
    tone: "success",
  },
  // Padang Bai → Lombok — open water.
  "Padang Bai|Lombok": {
    condition: "MODERATE",
    label: "Moderate seas",
    tone: "warning",
  },
  // Labuan Bajo → Komodo — Flores Sea, can be rough in monsoon season.
  "Labuan Bajo|Komodo": {
    condition: "MODERATE",
    label: "Moderate seas",
    tone: "warning",
  },
};

function routeKey(a: string, b: string): string {
  const [first, second] = [a, b].sort();
  return `${first}|${second}`;
}

export function getSeaCondition(
  origin: string,
  destination: string,
): RouteCondition | null {
  return ROUTE_CONDITIONS[routeKey(origin, destination)] ?? null;
}
