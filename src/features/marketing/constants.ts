import { SECONDS_PER_DAY } from '@/shared/constants/time';

// First-party cookie names and lifetimes. The lifetimes are privacy policy
// (they appear in the privacy page), so change them together with that page.
export const VISITOR_COOKIE = 'gf_vid';
export const VISITOR_MAX_AGE_SECONDS = 400 * SECONDS_PER_DAY;
export const ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = 90 * SECONDS_PER_DAY;
export const CONSENT_MAX_AGE_SECONDS = 180 * SECONDS_PER_DAY;
