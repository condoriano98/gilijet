import { localDateTimeToUtc } from '@/shared/lib/datetime';

/**
 * Pure parsing of the e-ticket email an operator (Wahana) sends us after the
 * PIC created the ticket by hand. No I/O, so every pattern is unit-testable
 * against real samples.
 *
 * The PIC types "<customer name> <Gilifast booking code>" into the operator's
 * dashboard, so the greeting reads e.g. "Hi Andy BK-2026-10-ABC234,". The code
 * is typed by hand: extraction is case-insensitive and tolerates stray spaces.
 */

// Same alphabet as booking/references.ts (no I, O, 0, 1). Wahana's own code
// (BK-260915-UZ1XEB: six digits, then letters) cannot match: the year is four
// digits and the month two, separated.
const BOOKING_CODE = /\bBK[\s-]*(\d{4})[\s-]*(\d{2})[\s-]*([A-HJ-NP-Z2-9]{6})\b/i;

export function extractBookingCode(text: string): string | null {
  const m = text.match(BOOKING_CODE);
  if (!m) return null;
  return `BK-${m[1]}-${m[2]}-${m[3].toUpperCase()}`;
}

/** Name from the greeting line, with any booking code removed. */
export function extractGreetingName(text: string): string | null {
  const m = text.match(/\b(?:hi|hello|halo|dear)\s+([^\n\r,<]{1,120})/i);
  if (!m) return null;
  // A mistyped code ("BK-ujicobaxxx-xxx") must not end up inside the name.
  const name = m[1]
    .replace(BOOKING_CODE, '')
    .replace(/\bBK[-\s]\S*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name || null;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', mei: '05', jun: '06',
  jul: '07', aug: '08', agu: '08', agt: '08', sep: '09', oct: '10', okt: '10',
  nov: '11', dec: '12', des: '12',
};

/** Every "22 Jul 2027 07:00" style departure in the text, as UTC instants (WITA input). */
export function extractDepartures(text: string): Date[] {
  const out: Date[] = [];
  const re = /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})[\s,·-]+(\d{1,2})[:.](\d{2})\b/g;
  for (const m of text.matchAll(re)) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!month) continue;
    const day = m[1].padStart(2, '0');
    const time = `${m[4].padStart(2, '0')}:${m[5]}`;
    out.push(localDateTimeToUtc(`${m[3]}-${month}-${day}`, time));
  }
  return out;
}

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** "Name <a@b.c>" or "a@b.c" to the lower-cased address. */
export function senderAddress(from: string): string | null {
  const m = from.match(/<([^>]+)>/) ?? from.match(/([^\s<>"]+@[^\s<>"]+)/);
  return m ? m[1].trim().toLowerCase() : null;
}

const FORWARD_HEADER = /^[ \t]*-{3,}\s*(?:forwarded message|original message)\s*-{3,}[ \t]*$/im;

export function hasForwardBlock(text: string): boolean {
  return FORWARD_HEADER.test(text);
}

/** Original sender when a human forwarded the mail instead of a filter. */
export function forwardedFromAddress(text: string): string | null {
  const m = text.match(
    /-{3,}\s*(?:forwarded message|original message)\s*-{3,}[\s\S]{0,200}?^\s*From:\s*(.+)$/im,
  );
  return m ? senderAddress(m[1]) : null;
}

/** Remove the "---- Forwarded Message ----" header block and its From/Date/Subject/To lines. */
export function stripForwardBlock(text: string): string {
  return text
    .replace(
      /^[ \t]*-{3,}\s*(?:forwarded message|original message)\s*-{3,}[ \t]*\r?\n(?:[ \t]*(?:From|Date|Subject|To|Cc|Reply-To|Sent):.*\r?\n)*/gim,
      '',
    )
    .replace(/^\s+/, '');
}

/** Strip "Fwd:" / "FW:" (repeated) from the front of a subject. */
export function cleanSubject(subject: string): string {
  return subject
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/^(?:\s*(?:fwd?|fw)\s*:\s*)+/i, '')
    .trim()
    .slice(0, 200);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(?:style|script)[\s\S]*?<\/(?:style|script)>/gi, '')
    .replace(/<br\s*\/?>|<\/(?:p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function textToHtml(text: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;white-space:pre-wrap;">${escapeHtml(text)}</div>`;
}

/**
 * The operator's HTML is forwarded under our name, and anyone who can email the
 * inbox could put a link or script in it. Keep the markup (it is a simple
 * table), drop everything that can run or lead somewhere: scripts, frames,
 * forms, remote images, event handlers, and links (their text stays).
 */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|form|svg|link|meta|base)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<(?:img|input|button|source|video|audio)\b[^>]*>/gi, '')
    .replace(/<\/?a\b[^>]*>/gi, '')
    .replace(/\s(?:on\w+|srcdoc|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(?:javascript|data|vbscript)\s*:/gi, '');
}
