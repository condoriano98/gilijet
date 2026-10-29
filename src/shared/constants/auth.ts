import { SECONDS_PER_DAY, SECONDS_PER_MINUTE } from './time';

// Separate cookies per role so a compromise on one side does not grant the other.
export const OPERATOR_COOKIE = 'gilifast_op';
export const ADMIN_COOKIE = 'gilifast_admin';
export const CUSTOMER_COOKIE = 'gilifast_cust';

export const SESSION_TTL_SECONDS = SECONDS_PER_DAY; // 24h (see §9.1)

// Carries the OAuth nonce between the Google sign-in start and its callback.
export const GOOGLE_STATE_COOKIE = 'gilifast_google_state';
export const GOOGLE_STATE_MAX_AGE_SECONDS = 10 * SECONDS_PER_MINUTE;
