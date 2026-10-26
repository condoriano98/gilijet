import { scrubError, truncate } from '@/features/marketing/privacy';

export const PROVIDER_TIMEOUT_MS = 10_000;

/** Thrown for a response that will not succeed on retry (bad request, auth). */
export class PermanentDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentDeliveryError';
  }
}

/** Thrown for timeouts, 429 and 5xx: worth another attempt later. */
export class RetryableDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableDeliveryError';
  }
}

/**
 * POST JSON with a timeout and classify the outcome. The response body is
 * returned parsed, because some providers answer 200 with errors inside.
 * Error messages never carry the request body or credentials.
 */
export async function postJson(
  url: string,
  body: unknown,
  opts: { headers?: Record<string, string>; label: string; fetchImpl?: typeof fetch } = { label: 'provider' },
): Promise<{ status: number; json: unknown; text: string }> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (err) {
    throw new RetryableDeliveryError(`${opts.label}: network error ${scrubError(err, 200)}`);
  }
  const text = await res.text().catch(() => '');
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (res.status === 429 || res.status >= 500) {
    throw new RetryableDeliveryError(`${opts.label}: HTTP ${res.status} ${scrubError(truncate(text, 300))}`);
  }
  if (res.status >= 400) {
    throw new PermanentDeliveryError(`${opts.label}: HTTP ${res.status} ${scrubError(truncate(text, 300))}`);
  }
  return { status: res.status, json, text };
}
