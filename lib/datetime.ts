import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * The MVP assumes operators run in WITA (Asia/Makassar, UTC+8) — Bali,
 * Lombok, Sulawesi. Sufficient for our pilot routes. Make this per-operator
 * when expanding to WIB (Java) or WIT (Maluku/Papua).
 */
export const OPERATOR_TIMEZONE = "Asia/Makassar";

/** Build a UTC Date from a local YYYY-MM-DD + HH:MM in the operator's zone. */
export function localDateTimeToUtc(dateYmd: string, timeHm: string): Date {
  return fromZonedTime(`${dateYmd}T${timeHm}:00`, OPERATOR_TIMEZONE);
}

/** Format a UTC Date back into local components for display. */
export function formatLocalDate(d: Date | string, pattern = "dd MMM yyyy"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return formatInTimeZone(date, OPERATOR_TIMEZONE, pattern);
}

export function formatLocalTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return formatInTimeZone(date, OPERATOR_TIMEZONE, "HH:mm");
}

export function formatLocalDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return formatInTimeZone(date, OPERATOR_TIMEZONE, "dd MMM yyyy HH:mm");
}

/** ISO day-of-week (1=Mon … 7=Sun) for a UTC instant in the operator's zone. */
export function isoDayOfWeek(utc: Date): number {
  const zoned = toZonedTime(utc, OPERATOR_TIMEZONE);
  const js = zoned.getDay(); // 0=Sun … 6=Sat
  return js === 0 ? 7 : js;
}

/** YYYY-MM-DD in the operator's zone. */
export function ymdInZone(utc: Date): string {
  return formatInTimeZone(utc, OPERATOR_TIMEZONE, "yyyy-MM-dd");
}
