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
  const subject = `Your Gilibali booking ${args.bookingReference}`;
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
    Selamat jalan! — Gilibali
  </p>
</body></html>`;
}

// ─── Payment received, seat not yet confirmed ────────────────────────────────

type PaymentReceivedArgs = {
  to: string;
  customerName: string;
  bookingReference: string;
  route: { originPort: string; destinationPort: string };
  boatName: string;
  departureDate: Date;
  totalAmount: number;
  lookupUrl: string;
};

/**
 * Sent the moment money settles. Deliberately carries no QR code: the seat is
 * not promised until an admin has reached the operator, and a boarding pass
 * here would be a promise we cannot keep. Its job is to stop a paying customer
 * hearing nothing at all.
 */
export async function sendPaymentReceivedEmail(
  args: PaymentReceivedArgs,
): Promise<{ delivered: boolean; provider: "resend" | "console" }> {
  const subject = `Payment received for ${args.bookingReference} — confirming your seat`;
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 4px;">Payment received</h2>
  <p style="margin:0 0 16px;color:#475569;">Thank you, ${escapeHtml(args.customerName)}. We have your payment of ${formatIDR(args.totalAmount)} for booking <strong>${escapeHtml(args.bookingReference)}</strong>.</p>
  <div style="border:1px solid #fed7aa;background:#fff7ed;border-radius:8px;padding:16px;margin-bottom:16px;">
    <div style="font-weight:600;margin-bottom:4px;">Your seat is being confirmed</div>
    <div style="color:#7c2d12;font-size:14px;">We are checking this departure directly with the boat operator. Your boarding pass will arrive by email and WhatsApp once that is done — usually within a few hours. Please do not travel to the harbour until you have it.</div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:6px 0;color:#64748b;">Route</td><td style="padding:6px 0;text-align:right;">${escapeHtml(args.route.originPort)} → ${escapeHtml(args.route.destinationPort)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;">Boat</td><td style="padding:6px 0;text-align:right;">${escapeHtml(args.boatName)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;">Departure</td><td style="padding:6px 0;text-align:right;">${formatLocalDateTime(args.departureDate)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;">Paid</td><td style="padding:6px 0;text-align:right;font-weight:600;">${formatIDR(args.totalAmount)}</td></tr>
  </table>
  <p style="margin-top:16px;font-size:13px;color:#64748b;">
    If the operator cannot take this departure we will cancel and refund you in full. Track your booking at
    <a href="${args.lookupUrl}">${args.lookupUrl}</a>.
  </p>
  <p style="margin-top:8px;color:#94a3b8;font-size:12px;">Selamat jalan! — Gilibali</p>
</body></html>`;

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.log(
      `\n[email] (no RESEND_API_KEY) → would send to ${args.to}\n` +
        `        subject: ${subject}\n` +
        `        lookup : ${args.lookupUrl}\n`,
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

// ─── Password reset email ─────────────────────────────────────────────────────

type PasswordResetArgs = {
  to: string;
  resetUrl: string;
};

export async function sendPasswordResetEmail(
  args: PasswordResetArgs,
): Promise<{ delivered: boolean; provider: "resend" | "console" }> {
  const subject = "Reset your Gilibali password";
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="margin:0 0 16px 0;font-size:22px;">Reset your password</h1>
  <p style="color:#475569;">Click the link below to set a new password. This link expires in 1 hour.</p>
  <p style="margin:16px 0;">
    <a href="${args.resetUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
      Reset password
    </a>
  </p>
  <p style="color:#94a3b8;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
</body></html>`;

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.log(
      `[email] (no RESEND_API_KEY) password-reset → ${args.to}\n` +
        `        url: ${args.resetUrl}`,
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
    console.error(`[email] Resend password-reset failed ${res.status}: ${text}`);
    return { delivered: false, provider: "resend" };
  }
  return { delivered: true, provider: "resend" };
}

// ─── Departure reminder email ─────────────────────────────────────────────────

type DepartureReminderArgs = {
  to: string;
  customerName: string;
  bookingReference: string;
  route: { originPort: string; destinationPort: string };
  boatName: string;
  departureDate: Date;
  lookupUrl: string;
  tickets: IssuedTicket[];
};

export async function sendDepartureReminder(
  args: DepartureReminderArgs,
): Promise<{ delivered: boolean; provider: "resend" | "console" }> {
  const subject = `Reminder: your boat departs tomorrow — ${args.bookingReference}`;
  const html = await renderDepartureReminderHtml(args);

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.log(
      `[email] (no RESEND_API_KEY) departure-reminder → ${args.to}\n` +
        `        booking: ${args.bookingReference}\n` +
        `        tickets: ${args.tickets.map((t) => t.ticketCode).join(", ")}`,
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
    console.error(`[email] Resend departure-reminder failed ${res.status}: ${text}`);
    return { delivered: false, provider: "resend" };
  }
  return { delivered: true, provider: "resend" };
}

async function renderDepartureReminderHtml(
  args: DepartureReminderArgs,
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
  <h1 style="margin:0 0 4px 0;font-size:22px;">Your departure is tomorrow</h1>
  <p style="margin:0 0 24px 0;color:#475569;">Reference <strong>${args.bookingReference}</strong></p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tr><td style="padding:6px 0;color:#475569;">Route</td><td style="padding:6px 0;text-align:right;font-weight:500;">${escapeHtml(args.route.originPort)} → ${escapeHtml(args.route.destinationPort)}</td></tr>
    <tr><td style="padding:6px 0;color:#475569;">Boat</td><td style="padding:6px 0;text-align:right;font-weight:500;">${escapeHtml(args.boatName)}</td></tr>
    <tr><td style="padding:6px 0;color:#475569;">Departure</td><td style="padding:6px 0;text-align:right;font-weight:500;">${formatLocalDateTime(args.departureDate)} WITA</td></tr>
  </table>

  <h2 style="font-size:16px;margin:0 0 12px 0;">Your boarding passes</h2>
  ${ticketBlocks.join("")}

  <p style="margin-top:16px;padding:12px;background:#f0f9ff;border-radius:8px;color:#0369a1;font-size:14px;">
    Arrive at least 30 minutes before departure. Bring a government ID.
  </p>
  <p style="margin-top:16px;color:#475569;font-size:14px;">
    View your booking at <a href="${args.lookupUrl}">${args.lookupUrl}</a>.
  </p>
  <p style="margin-top:8px;color:#94a3b8;font-size:12px;">Selamat jalan! — Gilibali</p>
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
  <p style="margin-top:8px;color:#94a3b8;font-size:12px;">Gilibali</p>
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
  <p style="margin-top:8px;color:#94a3b8;font-size:12px;">Gilibali</p>
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
