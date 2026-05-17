import { randomInt } from "node:crypto";

/**
 * Generates human-readable booking & ticket references.
 *
 *   booking : BK-2026-05-A4C9F1
 *   ticket  : TK-2026-05-A4C9F1-1
 *
 * The 6-char suffix is cryptographically random. With ~16M combinations per
 * (year, month) we tolerate the unique-index collision retry that callers
 * already do for safety.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
const SUFFIX_LEN = 6;

function randomSuffix(): string {
  let out = "";
  for (let i = 0; i < SUFFIX_LEN; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

function yearMonth(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function newBookingReference(at: Date = new Date()): string {
  return `BK-${yearMonth(at)}-${randomSuffix()}`;
}

export function newTicketCode(bookingReference: string, index: number): string {
  // Replace the BK- prefix with TK- and append passenger index.
  const tail = bookingReference.startsWith("BK-")
    ? bookingReference.slice(3)
    : bookingReference;
  return `TK-${tail}-${index}`;
}
