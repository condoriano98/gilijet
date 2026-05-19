import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * QR codes carry: `<ticketCode>.<signature>` where the signature is
 * HMAC-SHA256(ticketCode) truncated to 16 bytes and base64url-encoded.
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

export function signTicketCode(ticketCode: string): string {
  const sig = createHmac("sha256", env.QR_HMAC_SECRET)
    .update(ticketCode)
    .digest()
    .subarray(0, 16);
  return b64url(sig);
}

export function buildQrPayload(ticketCode: string): string {
  return `${ticketCode}.${signTicketCode(ticketCode)}`;
}

export type ParsedQr =
  | { ok: true; ticketCode: string }
  | { ok: false; reason: "MALFORMED" | "BAD_SIGNATURE" };

export function verifyQrPayload(payload: string): ParsedQr {
  const idx = payload.lastIndexOf(".");
  if (idx <= 0 || idx === payload.length - 1) {
    return { ok: false, reason: "MALFORMED" };
  }
  const ticketCode = payload.slice(0, idx);
  const provided = payload.slice(idx + 1);
  const expected = signTicketCode(ticketCode);
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
  return { ok: true, ticketCode };
}
