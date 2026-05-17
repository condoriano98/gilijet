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
  if (
    !timingSafeEqual(
      Buffer.from(provided, "utf8"),
      Buffer.from(expected, "utf8"),
    )
  ) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }
  return { ok: true, ticketCode };
}
