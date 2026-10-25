import { formatLocalDateTime } from '@/shared/lib/datetime';

/**
 * WhatsApp delivery via the Meta WhatsApp Cloud API. Falls back to logging the
 * rendered message when the credentials are absent, so the booking flow stays
 * exercisable in dev and in CI — same contract as email.ts.
 *
 * WhatsApp matters more than email here: most customers on this route are
 * reached on WhatsApp, and the operators themselves work entirely by phone.
 */

export type WhatsappResult = {
  delivered: boolean;
  provider: 'meta' | 'console';
};

const DEFAULT_API_VERSION = 'v26.0';
const DEFAULT_TEMPLATE_LANG = 'id';

export function isWhatsappConfigured(): boolean {
  // Check process.env directly (not cached env) to allow tests to change config
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
}

function graphUrl(path: 'messages' | 'media'): string {
  const version = process.env.WHATSAPP_API_VERSION?.trim() || DEFAULT_API_VERSION;
  return `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/${path}`;
}

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` };
}

async function postMessage(
  payload: Record<string, unknown>,
  what: string,
): Promise<WhatsappResult> {
  const res = await fetch(graphUrl('messages'), {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[whatsapp] Meta ${what} failed ${res.status}: ${text}`);
    return { delivered: false, provider: 'meta' };
  }
  return { delivered: true, provider: 'meta' };
}

/**
 * The Cloud API addresses recipients by digits only — no `+`, spaces or
 * dashes. A local Indonesian number written `08…` is the same subscriber as
 * `628…`, so it is normalised to the country-code form rather than rejected.
 */
export function normalizeWhatsappNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return null;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

async function sendText(to: string, body: string): Promise<WhatsappResult> {
  const number = normalizeWhatsappNumber(to);
  if (!number) {
    console.error(`[whatsapp] unusable number ${to} — skipping send`);
    return { delivered: false, provider: 'console' };
  }

  if (!isWhatsappConfigured()) {
    console.log(
      `\n[whatsapp] (no WHATSAPP_ACCESS_TOKEN) → would send to ${number}\n${body}\n`,
    );
    return { delivered: false, provider: 'console' };
  }

  return postMessage({ to: number, type: 'text', text: { body } }, 'text');
}

/**
 * Send a file as a WhatsApp document.
 *
 * The Cloud API takes the bytes through a media upload and then references the
 * returned media id, so the PDF never has to be parked at a public URL — which
 * matters here, because a boarding pass carries passenger names and a
 * scannable QR.
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
    return { delivered: false, provider: 'console' };
  }

  if (!isWhatsappConfigured()) {
    console.log(
      `\n[whatsapp] (no WHATSAPP_ACCESS_TOKEN) → would send ${filename} ` +
        `(${(file.length / 1024).toFixed(0)} KB) to ${number}\n${caption}\n`,
    );
    return { delivered: false, provider: 'console' };
  }

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append(
    'file',
    new Blob([new Uint8Array(file)], { type: 'application/pdf' }),
    filename,
  );
  // No Content-Type header: fetch sets it with the multipart boundary, and
  // overriding it produces a body Meta cannot parse.
  const upload = await fetch(graphUrl('media'), {
    method: 'POST',
    headers: authHeader(),
    body: form,
  });
  if (!upload.ok) {
    const text = await upload.text().catch(() => '');
    console.error(`[whatsapp] Meta media upload failed ${upload.status}: ${text}`);
    return { delivered: false, provider: 'meta' };
  }
  const { id } = (await upload.json().catch(() => ({}))) as { id?: string };
  if (!id) {
    console.error('[whatsapp] Meta media upload returned no id');
    return { delivered: false, provider: 'meta' };
  }

  return postMessage(
    { to: number, type: 'document', document: { id, filename, caption } },
    'document',
  );
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
  /** Set for round trips, where each leg's pass goes out as its own document. */
  leg?: { label: 'Berangkat' | 'Pulang'; index: number; total: number };
}): Promise<WhatsappResult> {
  const caption = [
    args.leg
      ? `Halo ${args.customerName}, boarding pass ${args.leg.label.toLowerCase()} Anda terlampir (${args.leg.index} dari ${args.leg.total}).`
      : `Halo ${args.customerName}, boarding pass Anda terlampir.`,
    `${args.route.originPort} → ${args.route.destinationPort}`,
    `${formatLocalDateTime(args.departureDate)} WITA`,
    `Kode booking: ${args.bookingReference}`,
    ...(args.leg
      ? [`Pemesanan pulang-pergi: ${args.leg.total} boarding pass (berangkat dan pulang), masing-masing dengan QR code sendiri.`]
      : []),
    `Tunjukkan QR code di dermaga. Selamat jalan! — Gilifast`,
  ].join('\n');
  return sendDocument(args.to, args.pdf, args.filename, caption);
}

/**
 * Send a pre-approved template.
 *
 * WhatsApp only lets a business open a conversation with a template; a plain
 * session message reaches someone only within 24 hours of *them* messaging the
 * business. Staff alerts are always business-initiated and the recipient never
 * messages in, so a session message there fails every time. Templates are the
 * only mechanism that works.
 *
 * The templates are positional: the values of `params` are sent in key order
 * as {{1}}, {{2}}, … so the order of the keys must match the template body.
 * The keys themselves only name the values for readers and logs. Meta rejects
 * empty values and newlines, so both are cleaned here.
 */
export async function sendTemplateMessage(args: {
  to: string;
  templateName: string;
  params: Record<string, string>;
}): Promise<WhatsappResult> {
  const number = normalizeWhatsappNumber(args.to);
  if (!number) {
    console.error(`[whatsapp] unusable number ${args.to} — skipping template`);
    return { delivered: false, provider: 'console' };
  }

  const rendered = Object.entries(args.params)
    .map(([k, v], i) => `  {{${i + 1}}} ${k}: ${v}`)
    .join('\n');

  if (!isWhatsappConfigured()) {
    console.log(
      `\n[whatsapp] (no WHATSAPP_ACCESS_TOKEN) → would send template ` +
        `"${args.templateName}" to ${number}\n${rendered}\n`,
    );
    return { delivered: false, provider: 'console' };
  }

  const parameters = Object.values(args.params).map((value) => ({
    type: 'text',
    text: value.replace(/\s+/g, ' ').trim() || '-',
  }));
  return postMessage(
    {
      to: number,
      type: 'template',
      template: {
        name: args.templateName,
        language: {
          code: process.env.WHATSAPP_TEMPLATE_LANG?.trim() || DEFAULT_TEMPLATE_LANG,
        },
        components: [{ type: 'body', parameters }],
      },
    },
    `template "${args.templateName}"`,
  );
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
  returnLeg?: {
    route: { originPort: string; destinationPort: string };
    boatName: string;
    departureDate: Date;
  };
}): Promise<WhatsappResult> {
  const body = [
    args.returnLeg
      ? `Halo ${args.customerName}, tempat duduk pulang-pergi Anda sudah dikonfirmasi (2 boarding pass: berangkat dan pulang).`
      : `Halo ${args.customerName}, tempat duduk Anda sudah dikonfirmasi.`,
    ``,
    `Kode booking: ${args.bookingReference}`,
    ...(args.returnLeg
      ? [
          `Berangkat: ${args.route.originPort} → ${args.route.destinationPort}`,
          `Kapal: ${args.boatName}`,
          `Waktu: ${formatLocalDateTime(args.departureDate)} WITA`,
          ``,
          `Pulang: ${args.returnLeg.route.originPort} → ${args.returnLeg.route.destinationPort}`,
          `Kapal: ${args.returnLeg.boatName}`,
          `Waktu: ${formatLocalDateTime(args.returnLeg.departureDate)} WITA`,
        ]
      : [
          `Rute: ${args.route.originPort} → ${args.route.destinationPort}`,
          `Kapal: ${args.boatName}`,
          `Berangkat: ${formatLocalDateTime(args.departureDate)} WITA`,
        ]),
    `Tiket: ${args.ticketCodes.join(', ')}`,
    ``,
    `Boarding pass dan QR code: ${args.lookupUrl}`,
    `Tunjukkan QR code tersebut di dermaga. Selamat jalan! — Gilifast`,
  ].join('\n');
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
  ].join('\n');
  return sendText(args.to, body);
}

export async function sendOperatorUnavailableWhatsapp(args: {
  to: string;
  customerName: string;
  bookingReference: string;
  lookupUrl: string;
  /** Why the departure was cancelled, as typed by the admin. */
  reason?: string;
  /** Round trips are cancelled whole, so say which two sailings are affected. */
  trip?: {
    outbound: { route: { originPort: string; destinationPort: string }; departureDate: Date };
    return: { route: { originPort: string; destinationPort: string }; departureDate: Date };
  };
}): Promise<WhatsappResult> {
  const body = [
    `Mohon maaf ${args.customerName}, operator tidak dapat menerima pemesanan ini.`,
    ``,
    `Kode booking: ${args.bookingReference}`,
    ...(args.reason?.trim() ? [`Alasan: ${args.reason.trim().slice(0, 200)}`] : []),
    ...(args.trip
      ? [
          `Pemesanan pulang-pergi dibatalkan seluruhnya (kedua perjalanan):`,
          `Berangkat: ${args.trip.outbound.route.originPort} → ${args.trip.outbound.route.destinationPort}, ${formatLocalDateTime(args.trip.outbound.departureDate)} WITA`,
          `Pulang: ${args.trip.return.route.originPort} → ${args.trip.return.route.destinationPort}, ${formatLocalDateTime(args.trip.return.departureDate)} WITA`,
        ]
      : []),
    ``,
    `Pemesanan dibatalkan dan dana Anda akan dikembalikan penuh.`,
    `Proses refund memerlukan waktu beberapa hari kerja.`,
    ``,
    `Detail: ${args.lookupUrl}`,
  ].join('\n');
  return sendText(args.to, body);
}
