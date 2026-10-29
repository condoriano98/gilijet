/**
 * Visitor consent for measurement, shared by the banner, the attribution
 * capture and the server-side delivery workers.
 *
 * Two choices only: analytics (GA4 behaviour, internal funnel counts) and
 * marketing (ad platforms: Google Ads, Meta). Marketing maps to all three of
 * Google's advertising consent types at once (ad_storage, ad_user_data,
 * ad_personalization); there is no UI for splitting them.
 *
 * Absent or unreadable cookie = everything denied. Essential cookies (auth,
 * locale) are not governed by this and payment processing never reads it.
 */
export const CONSENT_COOKIE = 'gf_consent';
export const CONSENT_VERSION = 1;

export type ConsentState = {
  analytics: boolean;
  marketing: boolean;
  /** False when the visitor has never answered the banner. */
  decided: boolean;
  /** Epoch ms of the decision, null when undecided. */
  decidedAt: number | null;
};

export const DENIED: ConsentState = {
  analytics: false,
  marketing: false,
  decided: false,
  decidedAt: null,
};

/** `v1.a1.m0.1730000000000` — version, analytics, marketing, decision time. */
export function serializeConsent(state: { analytics: boolean; marketing: boolean }, now = Date.now()): string {
  return `v${CONSENT_VERSION}.a${state.analytics ? 1 : 0}.m${state.marketing ? 1 : 0}.${now}`;
}

export function parseConsent(raw: string | null | undefined): ConsentState {
  if (!raw) return DENIED;
  const m = /^v(\d+)\.a([01])\.m([01])\.(\d{10,14})$/.exec(raw.trim());
  // A different version means the wording the visitor agreed to has changed,
  // so the old answer no longer counts.
  if (!m || Number(m[1]) !== CONSENT_VERSION) return DENIED;
  return {
    analytics: m[2] === '1',
    marketing: m[3] === '1',
    decided: true,
    decidedAt: Number(m[4]),
  };
}

export type GoogleConsentMode = {
  analytics_storage: 'granted' | 'denied';
  ad_storage: 'granted' | 'denied';
  ad_user_data: 'granted' | 'denied';
  ad_personalization: 'granted' | 'denied';
};

export function toGoogleConsentMode(state: Pick<ConsentState, 'analytics' | 'marketing'>): GoogleConsentMode {
  const ads = state.marketing ? 'granted' : 'denied';
  return {
    analytics_storage: state.analytics ? 'granted' : 'denied',
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
  };
}

/** What a stored event row keeps, so a later delivery can be gated on it. */
export type ConsentSnapshot = { analytics: boolean; marketing: boolean; decided: boolean };

export function snapshotConsent(state: ConsentState): ConsentSnapshot {
  return { analytics: state.analytics, marketing: state.marketing, decided: state.decided };
}

export function readConsentSnapshot(value: unknown): ConsentSnapshot {
  const v = (value ?? {}) as Partial<ConsentSnapshot>;
  return {
    analytics: v.analytics === true,
    marketing: v.marketing === true,
    decided: v.decided === true,
  };
}
