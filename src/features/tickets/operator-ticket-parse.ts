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

// Same alphabet as booking/references.ts (no I, O, 0, 1). The year, month and
// suffix must be separated by a space or dash: Wahana's own code (BK-261016-QSZPC4,
// six digits then letters) would otherwise read as year 2610, month 16.
const BOOKING_CODE = /\bBK[\s-]*(\d{4})[\s-]+(\d{2})[\s-]+([A-HJ-NP-Z2-9]{6})\b/i;

export function extractBookingCode(text: string): string | null {
  const m = text.match(BOOKING_CODE);
  if (!m) return null;
  return `BK-${m[1]}-${m[2]}-${m[3].toUpperCase()}`;
}

// The operator's own code, e.g. "BK-261024-K5DNVL": six digits, then letters or
// digits. Ours has a year and month group ("BK-2026-10-ABC234"), so it never matches.
const OPERATOR_CODE = /\bBK-\d{6}-[A-Z0-9]{4,8}\b/i;

export function extractOperatorBookingCode(text: string): string | null {
  const m = text.match(OPERATOR_CODE);
  return m ? m[0].toUpperCase() : null;
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
