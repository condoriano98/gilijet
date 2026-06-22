import { createHmac, timingSafeEqual } from "node:crypto";
import { ymdInZone } from "./datetime";
import { env } from "./env";

/**
 * QR codes carry: `<ticketCode>.<YYYY-MM-DD>.<signature>` where the YYYY-MM-DD
 * is the departure date in the operator timezone (WITA) and the signature is
 * HMAC-SHA256(`<ticketCode>.<YYYY-MM-DD>`) truncated to 16 bytes,
 * base64url-encoded.
 *
 * Binding the QR to its departure date prevents replay of a leaked QR
 * against any future leg, even in the unlikely event a ticketCode is
 * recycled. The verifier returns the date so the scanner can compare it
 * against the leg's departureDate.
 *
 * Server-side validation is the only trusted path (see §9.4).
 */

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function signTicketCode(ticketCode: string, departureYmd: string): string {
  const sig = createHmac("sha256", env.QR_HMAC_SECRET)
    .update(`${ticketCode}.${departureYmd}`)
    .digest()
    .subarray(0, 16);
  return b64url(sig);
}

export function buildQrPayload(ticketCode: string, departureDate: Date): string {
  const ymd = ymdInZone(departureDate);
  return `${ticketCode}.${ymd}.${signTicketCode(ticketCode, ymd)}`;
}

export type ParsedQr =
  | { ok: true; ticketCode: string; departureYmd: string }
  | { ok: false; reason: "MALFORMED" | "BAD_SIGNATURE" };

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function verifyQrPayload(payload: string): ParsedQr {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "MALFORMED" };
  }
  const [ticketCode, departureYmd, provided] = parts;
  if (!ticketCode || !provided || !YMD_RE.test(departureYmd)) {
    return { ok: false, reason: "MALFORMED" };
  }
  const expected = signTicketCode(ticketCode, departureYmd);
  if (provided.length !== expected.length) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }
  // Decode both as base64url so we compare raw signature bytes, not their
  // string encoding. Bad input (non-base64url chars) throws or yields an
  // empty buffer; treat that as a bad signature.
  let providedBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    providedBuf = Buffer.from(provided, "base64url");
    expectedBuf = Buffer.from(expected, "base64url");
  } catch {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }
  if (providedBuf.length !== expectedBuf.length || providedBuf.length === 0) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }
  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }
  return { ok: true, ticketCode, departureYmd };
}
