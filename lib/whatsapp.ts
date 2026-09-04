import { env } from "./env";
import { formatLocalDateTime } from "./datetime";
import { WHATSAPP_TEMPLATE } from "./whatsapp-templates";
import { appendFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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
  provider: "wati" | "meta" | "console" | "local";
};

/** Graph API version the Meta senders talk to. */
const META_GRAPH_VERSION = "v22.0";

/**
 * When WATI is not configured, messages are "delivered" into a local inbox
 * instead of being dropped on the console. This is what makes the booking flow
 * exercisable locally without a WATI account — the sent messages are
 * inspectable at /admin/diagnostics/whatsapp-inbox.
 *
 * The inbox is a JSONL file, not a module variable. In `next dev` the booking
 * server action and the inbox route handler run in separate module instances,
 * so an in-memory array is invisible to the other side; a file survives both
 * module reloads and dev-server restarts.
 */
export type LocalWhatsappMessage = {
  id: string;
  receivedAt: string;
  kind: "text" | "document" | "template";
  to: string;
  body?: string;
  filename?: string;
  sizeKb?: number;
  templateName?: string;
  params?: Record<string, string>;
};

const MAX_INBOX_MESSAGES = 200;
const INBOX_PATH =
  process.env.WHATSAPP_INBOX_PATH ??
  path.join(tmpdir(), "gilifast-whatsapp-inbox.jsonl");

function recordLocal(
  kind: LocalWhatsappMessage["kind"],
  to: string,
  fields: Omit<LocalWhatsappMessage, "id" | "receivedAt" | "kind" | "to">,
): void {
  const msg: LocalWhatsappMessage = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    kind,
    to,
    ...fields,
  };
  // Fire and forget. A write that fails (missing temp dir, no disk) must not
  // take the booking down with it — the message is still logged to the console.
  void appendFile(INBOX_PATH, `${JSON.stringify(msg)}\n`).catch(() => undefined);
}

export async function getLocalWhatsappInbox(): Promise<LocalWhatsappMessage[]> {
  const raw = await readFile(INBOX_PATH, "utf8").catch(() => "");
  if (!raw) return [];
  const lines = raw.split("\n").filter(Boolean);
  const messages: LocalWhatsappMessage[] = [];
  for (let i = lines.length - 1; i >= 0 && messages.length < MAX_INBOX_MESSAGES; i -= 1) {
    const msg = JSON.parse(lines[i]) as LocalWhatsappMessage;
    if (msg && msg.id) messages.push(msg);
  }
  return messages;
}

export async function clearLocalWhatsappInbox(): Promise<void> {
  await rm(INBOX_PATH, { force: true }).catch(() => undefined);
}

export function isWhatsappConfigured(): boolean {
  return Boolean(isWatiConfigured() || isMetaWhatsappConfigured());
}

export function isWatiConfigured(): boolean {
  return Boolean(env.WATI_API_KEY && env.WATI_TENANT_ID && env.WATI_API_URL);
}

export function isMetaWhatsappConfigured(): boolean {
  return Boolean(env.META_WHATSAPP_TOKEN && env.META_WHATSAPP_PHONE_NUMBER_ID);
}

/** Which live transport will carry the message, or null → local sandbox inbox. */
export function whatsappProvider(): "wati" | "meta" | null {
  if (isMetaWhatsappConfigured()) return "meta";
  if (isWatiConfigured()) return "wati";
  return null;
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

  const provider = whatsappProvider();
  if (!provider) {
    recordLocal("text", number, { body });
    console.log(
      `\n[whatsapp] (no WhatsApp provider configured) → would send to ${number}\n${body}\n`,
    );
    return { delivered: true, provider: "local" };
  }

  if (provider === "meta") return sendMetaText(number, body);

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
 * Meta WhatsApp Cloud API — plain text message.
 *
 * A session message reaches a user only within 24 hours of them messaging the
 * business. Customer notifications qualify (the customer initiated the booking
 * conversation by giving us their number); staff alerts must use templates,
 * which is why sendTemplateMessage exists separately.
 */
async function sendMetaText(number: string, body: string): Promise<WhatsappResult> {
  const url = metaMessagesUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: metaHeaders(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: number,
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[whatsapp] Meta failed ${res.status}: ${text}`);
    return { delivered: false, provider: "meta" };
  }
  return { delivered: true, provider: "meta" };
}

function metaMessagesUrl(): string {
  return (
    `https://graph.facebook.com/${META_GRAPH_VERSION}/` +
    `${env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`
  );
}

function metaHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.META_WHATSAPP_TOKEN}`,
    "Content-Type": "application/json",
  };
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

  const provider = whatsappProvider();
  if (!provider) {
    recordLocal("document", number, {
      filename,
      sizeKb: Math.round(file.length / 1024),
      body: caption,
    });
    console.log(
      `\n[whatsapp] (no WhatsApp provider configured) → would send ${filename} ` +
        `(${(file.length / 1024).toFixed(0)} KB) to ${number}\n${caption}\n`,
    );
    return { delivered: true, provider: "local" };
  }

  if (provider === "meta") return sendMetaDocument(number, file, filename, caption);

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

/**
 * Meta WhatsApp Cloud API — document send. Two calls: upload the bytes to the
 * /media endpoint to get a media id, then send a document message referencing
 * it. Like WATI, the PDF never sits on a public URL.
 */
async function sendMetaDocument(
  number: string,
  file: Buffer,
  filename: string,
  caption: string,
): Promise<WhatsappResult> {
  const uploadForm = new FormData();
  uploadForm.append("messaging_product", "whatsapp");
  uploadForm.append("type", "application/pdf");
  uploadForm.append(
    "file",
    new Blob([new Uint8Array(file)], { type: "application/pdf" }),
    filename,
  );

  const upload = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${env.META_WHATSAPP_PHONE_NUMBER_ID}/media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.META_WHATSAPP_TOKEN}` },
      body: uploadForm,
    },
  );
  if (!upload.ok) {
    const text = await upload.text().catch(() => "");
    console.error(`[whatsapp] Meta media upload failed ${upload.status}: ${text}`);
    return { delivered: false, provider: "meta" };
  }
  const uploaded = (await upload.json().catch(() => ({}))) as { id?: string };
  if (!uploaded.id) {
    console.error("[whatsapp] Meta media upload returned no media id");
    return { delivered: false, provider: "meta" };
  }

  const res = await fetch(metaMessagesUrl(), {
    method: "POST",
    headers: metaHeaders(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: number,
      type: "document",
      document: { id: uploaded.id, filename, caption },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[whatsapp] Meta document send failed ${res.status}: ${text}`);
    return { delivered: false, provider: "meta" };
  }
  return { delivered: true, provider: "meta" };
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

/**
 * Send a pre-approved WhatsApp template.
 *
 * WhatsApp only lets a business open a conversation with a template; a plain
 * session message reaches someone only within 24 hours of *them* messaging the
 * business. Staff alerts are always business-initiated and the recipient never
 * messages in, so a session message there fails every time. Templates are the
 * only mechanism that works.
 *
 * `params` map to the {{placeholders}} declared on the template, by name for
 * WATI; Meta takes them positionally (insertion order). A name the template
 * does not declare is ignored by WATI rather than rejected, so a template
 * edited to drop a variable degrades quietly.
 */
export async function sendTemplateMessage(args: {
  to: string;
  templateName: string;
  broadcastName: string;
  params: Record<string, string>;
}): Promise<WhatsappResult> {
  const number = normalizeWhatsappNumber(args.to);
  if (!number) {
    console.error(`[whatsapp] unusable number ${args.to} — skipping template`);
    return { delivered: false, provider: "console" };
  }

  const rendered = Object.entries(args.params)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

  const provider = whatsappProvider();
  if (!provider) {
    recordLocal("template", number, {
      templateName: args.templateName,
      params: args.params,
    });
    console.log(
      `\n[whatsapp] (no WhatsApp provider configured) → would send template ` +
        `"${args.templateName}" to ${number}\n${rendered}\n`,
    );
    return { delivered: true, provider: "local" };
  }

  if (provider === "meta") return sendMetaTemplate(number, args);

  const base = env.WATI_API_URL!.replace(/\/+$/, "");
  const res = await fetch(
    `${base}/api/v1/sendTemplateMessage?whatsappNumber=${number}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WATI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_name: args.templateName,
        broadcast_name: args.broadcastName,
        parameters: Object.entries(args.params).map(([name, value]) => ({
          name,
          value,
        })),
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[whatsapp] WATI template "${args.templateName}" failed ${res.status}: ${text}`,
    );
    return { delivered: false, provider: "wati" };
  }
  return { delivered: true, provider: "wati" };
}

/**
 * Meta WhatsApp Cloud API — pre-approved template. Meta takes the parameters
 * positionally (body components), unlike WATI's name-keyed parameters, so the
 * order of `params` must match the template's {{n}} order. The template name
 * and language must already be approved for the WABA in the Meta dashboard.
 */
async function sendMetaTemplate(
  number: string,
  args: {
    templateName: string;
    params: Record<string, string>;
  },
): Promise<WhatsappResult> {
  const res = await fetch(metaMessagesUrl(), {
    method: "POST",
    headers: metaHeaders(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: number,
      type: "template",
      template: {
        name: args.templateName,
        language: { code: env.META_WHATSAPP_TEMPLATE_LANGUAGE ?? "id" },
        components: [
          {
            type: "body",
            parameters: Object.values(args.params).map((value) => ({
              type: "text",
              text: value,
            })),
          },
        ],
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[whatsapp] Meta template "${args.templateName}" failed ${res.status}: ${text}`,
    );
    return { delivered: false, provider: "meta" };
  }
  return { delivered: true, provider: "meta" };
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

/**
 * Departure reminder, sent by cron the day before travel. By then the 24-hour
 * session window has long closed, so this must go as a template — a session
 * message would be rejected by WhatsApp as business-initiated outside the
 * window.
 */
export async function sendDepartureReminderWhatsapp(args: {
  to: string;
  customerName: string;
  bookingReference: string;
  route: { originPort: string; destinationPort: string };
  boatName: string;
  departureDate: Date;
  lookupUrl: string;
}): Promise<WhatsappResult> {
  return sendTemplateMessage({
    to: args.to,
    templateName: WHATSAPP_TEMPLATE.CUSTOMER_DEPARTURE_REMINDER,
    broadcastName: "gilifast_departure_reminder",
    // Insertion order is the Meta positional parameter order.
    params: {
      customerName: args.customerName,
      route: `${args.route.originPort} → ${args.route.destinationPort}`,
      boat: args.boatName,
      departure: `${formatLocalDateTime(args.departureDate)} WITA`,
      reference: args.bookingReference,
      lookupUrl: args.lookupUrl,
    },
  });
}
