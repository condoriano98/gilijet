import { getAllPorts } from "./port-info";

const R = 6371;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type NearestPortResult = {
  name: string;
  distanceKm: number;
};

export function nearestPorts(
  lat: number,
  lng: number,
  limit = 3,
): NearestPortResult[] {
  const ports = getAllPorts();
  const scored = ports.map((p) => ({
    name: p.name,
    distanceKm: haversineKm({ lat, lng }, { lat: p.lat, lng: p.lng }),
  }));
  scored.sort((a, b) => a.distanceKm - b.distanceKm);
  return scored.slice(0, limit);
}
