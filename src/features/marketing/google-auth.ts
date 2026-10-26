import { env } from '@/shared/server/env';
import { PermanentDeliveryError, RetryableDeliveryError, PROVIDER_TIMEOUT_MS } from '@/features/marketing/delivery/http';
import { scrubError } from '@/features/marketing/privacy';

/**
 * Short-lived Google access tokens from the stored refresh token. One OAuth
 * client serves both the Google Ads API (reporting) and the Data Manager API
 * (conversion upload); the refresh token must have been granted both scopes.
 */
let cached: { token: string; expiresAt: number } | null = null;

export async function googleAccessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  if (!env.GOOGLE_ADS_CLIENT_ID || !env.GOOGLE_ADS_CLIENT_SECRET || !env.GOOGLE_ADS_REFRESH_TOKEN) {
    throw new PermanentDeliveryError('google: OAuth client or refresh token not configured');
  }
  let res: Response;
  try {
    res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_ADS_CLIENT_ID,
        client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
        refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (err) {
    throw new RetryableDeliveryError(`google oauth: ${scrubError(err, 200)}`);
  }
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) {
    const msg = `google oauth: HTTP ${res.status} ${body.error ?? ''}`.trim();
    if (res.status >= 500) throw new RetryableDeliveryError(msg);
    throw new PermanentDeliveryError(msg);
  }
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/** Test hook. */
export function resetGoogleTokenCache(): void {
  cached = null;
}
