import { ATTRIBUTION_PARAMS, referrerHost, sanitizeUrl, truncate } from '@/features/marketing/privacy';

/**
 * Phase-one internal attribution.
 *
 * Model: last eligible non-direct touch within a lookback window (default 30
 * days), else direct; consent missing = consent_unavailable. This is a
 * management convention for reading spend against bookings, not a claim about
 * incrementality, and it will disagree with what Google and Meta report.
 *
 * Touches are captured in the browser into a first-party cookie (only with
 * consent) and frozen onto the booking at creation, so a confirmation delay,
 * a DOKU round trip or a direct return visit cannot overwrite them.
 */
export const ATTRIBUTION_COOKIE = 'gf_attr';
export const ATTRIBUTION_MODEL_VERSION = 'last-non-direct.v1';
export const ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export const CHANNELS = [
  'google_ads',
  'meta_ads',
  'other_paid',
  'organic_search',
  'social',
  'referral',
  'email',
  'direct',
  'consent_unavailable',
  'unknown',
] as const;
export type Channel = (typeof CHANNELS)[number];

/** One landing, as stored in the cookie. Short keys keep the cookie small. */
export type Touch = {
  /** epoch ms */
  at: number;
  src?: string;
  med?: string;
  cmp?: string;
  cnt?: string;
  trm?: string;
  /** campaign id (utm_id or gad_campaignid) */
  cid?: string;
  /** ad group / ad set id */
  agid?: string;
  /** ad id */
  adid?: string;
  /** gad_source: set by Google Ads auto-tagging, not an identifier */
  gads?: string;
  /**
   * Which platform's click id was on the URL ('g' Google, 'm' Meta), kept even
   * when the id itself is dropped for lack of marketing consent, so the
   * channel can still be classified.
   */
  clk?: 'g' | 'm';
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  /** sanitized landing path */
  lp?: string;
  /** referrer host only */
  ref?: string;
};

export type AttributionCookie = { v: 1; ft?: Touch; lt?: Touch };

/** Hosts that hand a visitor back to us and must not count as a referral. */
const SELF_REFERRAL_HOSTS = [/(^|\.)doku\.com$/, /(^|\.)paypal\.com$/, /(^|\.)gilifast\./, /(^|\.)gilijet\./, /^localhost$/];
const SEARCH_HOSTS = /(^|\.)(google|bing|yahoo|duckduckgo|yandex|baidu|ecosia|naver)\./;
const SOCIAL_HOSTS = /(^|\.)(facebook|instagram|fb|t|x|twitter|tiktok|linkedin|pinterest|reddit|youtube|threads|whatsapp|wa|l\.facebook|lm\.facebook)\.(com|me|co|net)$/;
const META_SOURCES = /^(facebook|fb|instagram|ig|meta|an|messenger)$/i;
const PAID_MEDIUMS = /^(cpc|ppc|paid|paidsearch|paid_search|paid-social|paid_social|paidsocial|display|cpm|retargeting|ads?)$/i;

export function isSelfReferral(host: string | null, ownHost?: string | null): boolean {
  if (!host) return true;
  if (ownHost && host === ownHost.toLowerCase()) return true;
  return SELF_REFERRAL_HOSTS.some((re) => re.test(host));
}

/**
 * Build a touch from a landing URL and referrer. Returns null for a landing
 * that carries no campaign signal and no external referrer — a direct visit,
 * or a return from DOKU, which must not replace the earlier touch.
 */
export function touchFromLanding(args: {
  url: string;
  referrer?: string | null;
  ownHost?: string | null;
  now?: number;
  /** Click ids are advertising identifiers: only kept with marketing consent. */
  allowClickIds: boolean;
}): Touch | null {
  let url: URL;
  try {
    url = new URL(args.url);
  } catch {
    return null;
  }
  const p = url.searchParams;
  const get = (k: (typeof ATTRIBUTION_PARAMS)[number], max = 150) => {
    const v = p.get(k)?.trim();
    return v ? truncate(v, max) : undefined;
  };
  const ref = referrerHost(args.referrer ?? null);
  const external = ref && !isSelfReferral(ref, args.ownHost ?? url.hostname) ? ref : undefined;

  const touch: Touch = {
    at: args.now ?? Date.now(),
    src: get('utm_source')?.toLowerCase(),
    med: get('utm_medium')?.toLowerCase(),
    cmp: get('utm_campaign'),
    cnt: get('utm_content'),
    trm: get('utm_term'),
    cid: get('utm_id', 64) ?? get('gad_campaignid', 64),
    agid: get('gf_agid', 64),
    adid: get('gf_adid', 64),
    gads: get('gad_source', 16),
    lp: sanitizeUrl(url.toString()) ?? undefined,
    ref: external,
  };
  if (p.has('gclid') || p.has('gbraid') || p.has('wbraid')) touch.clk = 'g';
  else if (p.has('fbclid')) touch.clk = 'm';
  if (args.allowClickIds) {
    touch.gclid = get('gclid', 255);
    touch.gbraid = get('gbraid', 255);
    touch.wbraid = get('wbraid', 255);
    touch.fbclid = get('fbclid', 255);
  }
  const hasCampaignSignal = Boolean(
    touch.src || touch.med || touch.cmp || touch.cid || touch.clk || touch.gads,
  );
  if (!hasCampaignSignal && !external) return null;
  return stripUndefined(touch);
}

/**
 * Fold a new landing into the stored cookie. First touch is written once;
 * last touch is replaced by any later non-direct touch.
 */
export function mergeTouch(existing: AttributionCookie | null, touch: Touch | null): AttributionCookie | null {
  if (!touch) return existing;
  return { v: 1, ft: existing?.ft ?? touch, lt: touch };
}

export function classifyTouch(t: Touch | undefined | null): Channel {
  if (!t) return 'direct';
  const src = t.src ?? '';
  const med = t.med ?? '';
  // Auto-tagging click ids are the strongest signal for Google; gad_source
  // without a gclid (consent denied for click ids) still says Google Ads.
  if (t.clk === 'g' || t.gclid || t.gbraid || t.wbraid || t.gads || (src === 'google' && PAID_MEDIUMS.test(med))) return 'google_ads';
  if (META_SOURCES.test(src) && PAID_MEDIUMS.test(med)) return 'meta_ads';
  if (med === 'email' || src === 'newsletter') return 'email';
  if (src && PAID_MEDIUMS.test(med)) return 'other_paid';
  if (src || med || t.cmp) {
    if (META_SOURCES.test(src)) return 'social';
    return 'referral';
  }
  // fbclid alone is added to organic Facebook/Instagram clicks too, so it is
  // social, not paid Meta, unless the ad's URL parameters say otherwise.
  if (t.fbclid || t.clk === 'm') return 'social';
  if (t.ref && SEARCH_HOSTS.test(t.ref)) return 'organic_search';
  if (t.ref && SOCIAL_HOSTS.test(t.ref)) return 'social';
  if (t.ref) return 'referral';
  return 'direct';
}

export function platformForChannel(channel: Channel): 'google' | 'meta' | null {
  if (channel === 'google_ads') return 'google';
  if (channel === 'meta_ads') return 'meta';
  return null;
}

export type ResolvedAttribution = {
  modelVersion: string;
  lookbackDays: number;
  channel: Channel;
  platform: 'google' | 'meta' | null;
  lastTouch: Touch | null;
  firstTouch: Touch | null;
};

/**
 * Decide the booking's channel at creation time from the cookie contents.
 *
 * - No consent at all: consent_unavailable, nothing stored from the cookie.
 * - Last touch older than the lookback: direct (the first touch is still kept
 *   for reference, but does not earn the booking).
 * - No cookie with consent given: direct.
 */
export function resolveAttribution(args: {
  cookie: AttributionCookie | null;
  consent: { analytics: boolean; marketing: boolean };
  lookbackDays: number;
  now?: number;
}): ResolvedAttribution {
  const base = { modelVersion: ATTRIBUTION_MODEL_VERSION, lookbackDays: args.lookbackDays };
  if (!args.consent.analytics && !args.consent.marketing) {
    return { ...base, channel: 'consent_unavailable', platform: null, lastTouch: null, firstTouch: null };
  }
  const now = args.now ?? Date.now();
  const cutoff = now - args.lookbackDays * 24 * 60 * 60 * 1000;
  const lt = args.cookie?.lt && args.cookie.lt.at >= cutoff && args.cookie.lt.at <= now + 60_000 ? args.cookie.lt : null;
  const ft = args.cookie?.ft ?? null;
  const channel = classifyTouch(lt);
  return { ...base, channel, platform: platformForChannel(channel), lastTouch: lt, firstTouch: ft };
}

export function encodeAttributionCookie(c: AttributionCookie): string {
  return encodeURIComponent(JSON.stringify(c));
}

export function decodeAttributionCookie(raw: string | null | undefined): AttributionCookie | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as AttributionCookie;
    if (!parsed || parsed.v !== 1) return null;
    return { v: 1, ft: readTouch(parsed.ft), lt: readTouch(parsed.lt) };
  } catch {
    return null;
  }
}

const TOUCH_STRING_KEYS = ['src', 'med', 'cmp', 'cnt', 'trm', 'cid', 'agid', 'adid', 'gads', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'lp', 'ref'] as const;

/** The cookie is client-writable, so every field is re-validated on read. */
function readTouch(v: unknown): Touch | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'number' || !Number.isFinite(o.at)) return undefined;
  const t: Touch = { at: o.at };
  for (const k of TOUCH_STRING_KEYS) {
    const val = o[k];
    if (typeof val === 'string' && val) t[k] = truncate(val, k === 'lp' ? 300 : 255);
  }
  if (o.clk === 'g' || o.clk === 'm') t.clk = o.clk;
  if (t.lp) t.lp = sanitizeUrl(t.lp) ?? undefined;
  return t;
}

/** `fb.1.<ms>.<fbclid>`, Meta's documented fbc format. */
export function fbcFromFbclid(fbclid: string, at: number): string {
  return `fb.1.${at}.${fbclid}`;
}

/** The GA client id is the last two dot-separated parts of the `_ga` cookie. */
export function gaClientIdFromCookie(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length < 4) return null;
  const id = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  return /^\d+\.\d+$/.test(id) ? id : null;
}

/**
 * The GA4 session id from a `_ga_<container>` cookie. Two formats exist:
 * `GS1.1.<sid>.…` and the newer `GS2.1.s<sid>$o…`.
 */
export function gaSessionIdFromCookie(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const gs2 = /^GS2\.\d+\.s(\d+)/.exec(raw);
  if (gs2) return gs2[1];
  const gs1 = /^GS1\.\d+\.(\d+)\./.exec(raw);
  return gs1 ? gs1[1] : null;
}

export function deviceClassFromUserAgent(ua: string | null | undefined): 'mobile' | 'tablet' | 'desktop' | null {
  if (!ua) return null;
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|BlackBerry|Opera Mini|IEMobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}
