import { env } from "./env";
import { formatLocalDateTime } from "./datetime";
import { formatIDR } from "./utils";
import { renderQrSvgDataUrl } from "./qr-render";
import type { IssuedTicket } from "./ticket-issuer";

/**
 * Transactional email. Wired up to Resend when RESEND_API_KEY is set;
 * otherwise we log the rendered HTML to the server console so the rest of
 * the booking flow stays exercisable in dev.
 */

type BookingConfirmationArgs = {
  to: string;
  customerName: string;
  bookingReference: string;
  route: { originPort: string; destinationPort: string };
  boatName: string;
  departureDate: Date;
  totalAmount: number;
  lookupUrl: string;
  tickets: IssuedTicket[];
};

export async function sendBookingConfirmation(
  args: BookingConfirmationArgs,
): Promise<{ delivered: boolean; provider: "resend" | "console" }> {
  const subject = `Your Gilijet booking ${args.bookingReference}`;
  const html = await renderBookingConfirmationHtml(args);

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.log(
      `\n[email] (no RESEND_API_KEY) → would send to ${args.to}\n` +
        `        subject: ${subject}\n` +
        `        lookup : ${args.lookupUrl}\n` +
        `        tickets: ${args.tickets.map((t) => t.ticketCode).join(", ")}\n`,
    );
    return { delivered: false, provider: "console" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [args.to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[email] Resend failed ${res.status}: ${text}`);
    return { delivered: false, provider: "resend" };
  }
  return { delivered: true, provider: "resend" };
}

async function renderBookingConfirmationHtml(
  args: BookingConfirmationArgs,
): Promise<string> {
  const ticketBlocks = await Promise.all(
    args.tickets.map(async (t) => {
      const qrDataUrl = await renderQrSvgDataUrl(t.qrPayload);
      return `
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:12px;">
          <div style="font-weight:600;font-size:15px;">${escapeHtml(t.passengerName)}</div>
          <div style="font-family:monospace;font-size:12px;color:#475569;margin-bottom:8px;">${t.ticketCode}</div>
          <img src="${qrDataUrl}" alt="QR for ${t.ticketCode}" width="160" height="160" style="display:block;" />
        </div>
      `;
    }),
  );

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="margin:0 0 4px 0;font-size:22px;">Booking confirmed</h1>
  <p style="margin:0 0 24px 0;color:#475569;">Reference <strong>${args.bookingReference}</strong></p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tr><td style="padding:6px 0;color:#475569;">Route</td><td style="padding:6px 0;text-align:right;font-weight:500;">${escapeHtml(args.route.originPort)} → ${escapeHtml(args.route.destinationPort)}</td></tr>
    <tr><td style="padding:6px 0;color:#475569;">Boat</td><td style="padding:6px 0;text-align:right;font-weight:500;">${escapeHtml(args.boatName)}</td></tr>
    <tr><td style="padding:6px 0;color:#475569;">Departure</td><td style="padding:6px 0;text-align:right;font-weight:500;">${formatLocalDateTime(args.departureDate)} WITA</td></tr>
    <tr><td style="padding:6px 0;color:#475569;">Total paid</td><td style="padding:6px 0;text-align:right;font-weight:500;">${formatIDR(args.totalAmount)}</td></tr>
  </table>

  <h2 style="font-size:16px;margin:0 0 12px 0;">Boarding passes</h2>
  ${ticketBlocks.join("")}

  <p style="margin-top:24px;color:#475569;font-size:14px;">
    Show each QR code at the dock. You can also access them anytime at
    <a href="${args.lookupUrl}">${args.lookupUrl}</a>.
  </p>
  <p style="margin-top:8px;color:#94a3b8;font-size:12px;">
    Selamat jalan! — Gilijet
  </p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ─── Cancellation email ──────────────────────────────────────────────────────

type CancellationEmailArgs = {
  to: string;
  customerName: string;
  bookingReference: string;
  route: { originPort: string; destinationPort: string };
  departureDate: Date;
  refundAmount: number;
  refundTier: "FULL" | "PARTIAL" | "NONE";
  lookupUrl: string;
};

export async function sendCancellationEmail(
  args: CancellationEmailArgs,
): Promise<{ delivered: boolean; provider: "resend" | "console" }> {
  const subject = `Booking ${args.bookingReference} cancelled`;

  const refundLine =
    args.refundTier === "NONE"
      ? "No refund is due based on the cancellation window."
      : `Refund of <strong>${formatIDR(args.refundAmount)}</strong> will be processed within 5–14 business days.`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="margin:0 0 4px 0;font-size:22px;">Booking cancelled</h1>
  <p style="margin:0 0 24px 0;color:#475569;">Reference <strong>${args.bookingReference}</strong></p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tr><td style="padding:6px 0;color:#475569;">Route</td><td style="padding:6px 0;text-align:right;">${escapeHtml(args.route.originPort)} → ${escapeHtml(args.route.destinationPort)}</td></tr>
    <tr><td style="padding:6px 0;color:#475569;">Departure</td><td style="padding:6px 0;text-align:right;">${formatLocalDateTime(args.departureDate)} WITA</td></tr>
  </table>
  <p style="color:#475569;">${refundLine}</p>
  <p style="margin-top:16px;color:#475569;font-size:14px;">
    View your booking at <a href="${args.lookupUrl}">${args.lookupUrl}</a>.
  </p>
  <p style="margin-top:8px;color:#94a3b8;font-size:12px;">Gilijet</p>
</body></html>`;

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.log(`[email] (no RESEND_API_KEY) cancellation → ${args.to}`);
    return { delivered: false, provider: "console" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [args.to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[email] Resend cancellation failed ${res.status}: ${text}`);
    return { delivered: false, provider: "resend" };
  }
  return { delivered: true, provider: "resend" };
}

// ─── Refund processed email ───────────────────────────────────────────────────

type RefundEmailArgs = {
  to: string;
  customerName: string;
  bookingReference: string;
  refundAmount: number;
  lookupUrl: string;
};

export async function sendRefundProcessedEmail(
  args: RefundEmailArgs,
): Promise<{ delivered: boolean; provider: "resend" | "console" }> {
  const subject = `Refund processed for ${args.bookingReference}`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="margin:0 0 4px 0;font-size:22px;">Refund processed</h1>
  <p style="margin:0 0 24px 0;color:#475569;">Reference <strong>${args.bookingReference}</strong></p>
  <p style="color:#475569;">We have processed a refund of <strong>${formatIDR(args.refundAmount)}</strong> to your original payment method. Allow 5–14 business days depending on your bank.</p>
  <p style="margin-top:16px;color:#475569;font-size:14px;">
    View details at <a href="${args.lookupUrl}">${args.lookupUrl}</a>.
  </p>
  <p style="margin-top:8px;color:#94a3b8;font-size:12px;">Gilijet</p>
</body></html>`;

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.log(`[email] (no RESEND_API_KEY) refund-processed → ${args.to}`);
    return { delivered: false, provider: "console" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [args.to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[email] Resend refund-processed failed ${res.status}: ${text}`);
    return { delivered: false, provider: "resend" };
  }
  return { delivered: true, provider: "resend" };
}
