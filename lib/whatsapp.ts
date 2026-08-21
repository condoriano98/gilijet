import { env } from "./env";
import { formatLocalDateTime } from "./datetime";

/**
 * WhatsApp delivery via WATI. Falls back to logging the rendered message when
 * the WATI credentials are absent, so the booking flow stays exercisable in
 * dev and in CI — same contract as lib/email.ts.
 *
 * WhatsApp matters more than email here: most customers on this route are
 * reached on WhatsApp, and the operators themselves work entirely by phone.
 */

export type WhatsappResult = {
  delivered: boolean;
  provider: "wati" | "console";
};

export function isWhatsappConfigured(): boolean {
  return Boolean(env.WATI_API_KEY && env.WATI_TENANT_ID && env.WATI_API_URL);
}

/**
 * WATI addresses recipients by digits only — no `+`, spaces or dashes. A local
 * Indonesian number written `08…` is the same subscriber as `628…`, so it is
 * normalised to the country-code form rather than rejected.
 */
export function normalizeWhatsappNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

async function sendText(to: string, body: string): Promise<WhatsappResult> {
  const number = normalizeWhatsappNumber(to);
  if (!number) {
    console.error(`[whatsapp] unusable number ${to} — skipping send`);
    return { delivered: false, provider: "console" };
  }

  if (!isWhatsappConfigured()) {
    console.log(
      `\n[whatsapp] (no WATI_API_KEY) → would send to ${number}\n${body}\n`,
    );
    return { delivered: false, provider: "console" };
  }

  const base = env.WATI_API_URL!.replace(/\/+$/, "");
  const url = `${base}/api/v1/sendSessionMessage/${number}?messageText=${encodeURIComponent(body)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WATI_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[whatsapp] WATI failed ${res.status}: ${text}`);
    return { delivered: false, provider: "wati" };
  }
  return { delivered: true, provider: "wati" };
}

/**
 * Send a file as a WhatsApp document.
 *
 * WATI takes the bytes directly as multipart/form-data, so the PDF never has
 * to be parked at a public URL — which matters here, because a boarding pass
 * carries passenger names and a scannable QR.
 */
async function sendDocument(
  to: string,
  file: Buffer,
  filename: string,
  caption: string,
): Promise<WhatsappResult> {
  const number = normalizeWhatsappNumber(to);
  if (!number) {
    console.error(`[whatsapp] unusable number ${to} — skipping document`);
    return { delivered: false, provider: "console" };
  }

  if (!isWhatsappConfigured()) {
    console.log(
      `\n[whatsapp] (no WATI_API_KEY) → would send ${filename} ` +
        `(${(file.length / 1024).toFixed(0)} KB) to ${number}\n${caption}\n`,
    );
    return { delivered: false, provider: "console" };
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(file)], { type: "application/pdf" }),
    filename,
  );

  const base = env.WATI_API_URL!.replace(/\/+$/, "");
  const url =
    `${base}/api/v1/sendSessionFile/${number}` +
    `?caption=${encodeURIComponent(caption)}`;
  // No Content-Type header: fetch sets it with the multipart boundary, and
  // overriding it produces a body WATI cannot parse.
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WATI_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[whatsapp] WATI file send failed ${res.status}: ${text}`);
    return { delivered: false, provider: "wati" };
  }
  return { delivered: true, provider: "wati" };
}

/** The boarding pass PDF itself, as a WhatsApp document. */
export async function sendBoardingPassDocument(args: {
  to: string;
  customerName: string;
  bookingReference: string;
  route: { originPort: string; destinationPort: string };
  departureDate: Date;
  pdf: Buffer;
  filename: string;
}): Promise<WhatsappResult> {
  const caption = [
    `Halo ${args.customerName}, boarding pass Anda terlampir.`,
    `${args.route.originPort} → ${args.route.destinationPort}`,
    `${formatLocalDateTime(args.departureDate)} WITA`,
    `Kode booking: ${args.bookingReference}`,
    `Tunjukkan QR code di dermaga. Selamat jalan! — Gilifast`,
  ].join("\n");
  return sendDocument(args.to, args.pdf, args.filename, caption);
}

export async function sendBoardingPassWhatsapp(args: {
  to: string;
  customerName: string;
  bookingReference: string;
  route: { originPort: string; destinationPort: string };
  boatName: string;
  departureDate: Date;
  ticketCodes: string[];
  lookupUrl: string;
}): Promise<WhatsappResult> {
  const body = [
    `Halo ${args.customerName}, tempat duduk Anda sudah dikonfirmasi.`,
    ``,
    `Kode booking: ${args.bookingReference}`,
    `Rute: ${args.route.originPort} → ${args.route.destinationPort}`,
    `Kapal: ${args.boatName}`,
    `Berangkat: ${formatLocalDateTime(args.departureDate)} WITA`,
    `Tiket: ${args.ticketCodes.join(", ")}`,
    ``,
    `Boarding pass dan QR code: ${args.lookupUrl}`,
    `Tunjukkan QR code tersebut di dermaga. Selamat jalan! — Gilifast`,
  ].join("\n");
  return sendText(args.to, body);
}

export async function sendPaymentReceivedWhatsapp(args: {
  to: string;
  customerName: string;
  bookingReference: string;
  lookupUrl: string;
}): Promise<WhatsappResult> {
  const body = [
    `Halo ${args.customerName}, pembayaran Anda sudah kami terima.`,
    ``,
    `Kode booking: ${args.bookingReference}`,
    ``,
    `Kami sedang mengonfirmasi jadwal ini langsung ke operator kapal.`,
    `Boarding pass akan dikirim setelah dikonfirmasi — biasanya dalam beberapa jam.`,
    `Mohon jangan berangkat ke dermaga sebelum menerima boarding pass.`,
    ``,
    `Cek status: ${args.lookupUrl}`,
  ].join("\n");
  return sendText(args.to, body);
}

export async function sendOperatorUnavailableWhatsapp(args: {
  to: string;
  customerName: string;
  bookingReference: string;
  lookupUrl: string;
}): Promise<WhatsappResult> {
  const body = [
    `Mohon maaf ${args.customerName}, operator tidak dapat menerima pemesanan ini.`,
    ``,
    `Kode booking: ${args.bookingReference}`,
    ``,
    `Pemesanan dibatalkan dan dana Anda akan dikembalikan penuh.`,
    `Proses refund memerlukan waktu beberapa hari kerja.`,
    ``,
    `Detail: ${args.lookupUrl}`,
  ].join("\n");
  return sendText(args.to, body);
}
