/**
 * Guards that keep passenger data out of analytics payloads.
 *
 * Everything that leaves the server for GA4, the dataLayer, the collect
 * endpoint or a dashboard export goes through one of these. They are
 * allowlists, not denylists: an unknown query parameter or property is
 * dropped rather than passed on.
 */

/** Query parameters worth keeping on a stored or reported URL. */
export const ATTRIBUTION_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  // Google auto-tagging and its iOS/web-to-app variants.
  'gclid',
  'gbraid',
  'wbraid',
  'gad_source',
  'gad_campaignid',
  // Meta adds this to every outbound click, paid or not.
  'fbclid',
  // Our own ad-group/ad-set and ad id params, filled by the platforms'
  // URL templates (see docs/MARKETING_MEASUREMENT.md).
  'gf_agid',
  'gf_adid',
] as const;

/** The subset safe to show in reports; click ids stay server-side. */
const REPORTABLE_PARAMS = new Set<string>([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'gad_source',
  'gad_campaignid',
  'gf_agid',
  'gf_adid',
]);

/**
 * Path segments that are bearer tokens: a booking reference opens the booking
 * page, so it must never reach GA4 or an export.
 */
const CAPABILITY_ROUTES = /\/(b|pay|checkout|book)\/([^/?#]+)/g;

export function sanitizePath(path: string): string {
  const clean = path.split(/[?#]/)[0] || '/';
  return clean.replace(CAPABILITY_ROUTES, (_m, route: string, seg: string) =>
    route === 'book' && seg === '0' ? '/book/0' : `/${route}/:id`,
  );
}

/**
 * A URL with only reportable attribution params kept and capability segments
 * masked. Returns null for anything that does not parse.
 */
export function sanitizeUrl(raw: string | null | undefined, base = 'https://gilifast.local'): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  const kept = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (REPORTABLE_PARAMS.has(k) && v) kept.set(k, truncate(v, 150));
  }
  const qs = kept.toString();
  return `${sanitizePath(url.pathname)}${qs ? `?${qs}` : ''}`;
}

/** Only the host of a referrer is kept: full referrer URLs carry search terms and tokens. */
export function referrerHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

export function truncate(v: string, max: number): string {
  return v.length > max ? v.slice(0, max) : v;
}

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?/g;
// Nine or more digits in one run, allowing phone-style separators: phone,
// passport and NIK numbers. ISO dates are removed first so a departure date
// is not mistaken for one. Booking totals are numbers, not strings.
const LONG_DIGITS_RE = /\+?\d(?:[\s().-]?\d){8,}/;

function looksLikeIdentifier(s: string): boolean {
  return EMAIL_RE.test(s) || LONG_DIGITS_RE.test(s.replace(ISO_DATE_RE, ''));
}
const PII_KEYS = /(name|email|e-mail|phone|mobile|whatsapp|passport|nik|id_?number|idnumber|address|birth|nationality)/i;

/**
 * True when a payload carries something that looks like personal data. Used
 * as a last-line check before anything is pushed to the dataLayer or stored
 * from the public collect endpoint.
 */
export function containsPii(value: unknown, depth = 0): boolean {
  if (depth > 6 || value == null) return false;
  if (typeof value === 'string') return looksLikeIdentifier(value);
  if (Array.isArray(value)) return value.some((v) => containsPii(v, depth + 1));
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Key names that announce personal data are refused even when empty,
      // except the GA4 item/route fields that only use "name" for a product.
      if (PII_KEYS.test(k) && !SAFE_NAME_KEYS.has(k)) return true;
      if (containsPii(v, depth + 1)) return true;
    }
  }
  return false;
}

const SAFE_NAME_KEYS = new Set(['event_name', 'item_name', 'campaign_name', 'page_name']);

/** Keep only listed keys with primitive values, truncating strings. */
export function pickPrimitives(
  input: Record<string, unknown>,
  allowed: readonly string[],
  maxLen = 120,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const key of allowed) {
    const v = input[key];
    if (typeof v === 'string' && v) out[key] = truncate(v, maxLen);
    else if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof v === 'boolean') out[key] = v;
  }
  return out;
}

/** Strip anything token-shaped from an error before it is stored or logged. */
export function scrubError(err: unknown, max = 500): string {
  const raw = err instanceof Error ? err.message : String(err);
  return truncate(
    raw
      .replace(/(access_token|api_secret|developer-token|authorization|refresh_token|client_secret)(["'=:\s]+)[^\s"'&,}]+/gi, '$1$2[redacted]')
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer [redacted]')
      .replace(/EAA[A-Za-z0-9]{20,}/g, '[redacted]'),
    max,
  );
}
