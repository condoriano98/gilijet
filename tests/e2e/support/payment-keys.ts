/**
 * Which payment / messaging credentials in `env` are real. Pure, so it can be
 * unit-tested; `mock-payments.ts` turns it into a hard stop for e2e specs.
 *
 * DOKU treats a client id starting `test_mock_` as mock mode, so that one is
 * allowed. Anything else non-empty could reach a live gateway.
 */
export function livePaymentKeys(env: Record<string, string | undefined>): string[] {
  const set = (name: string) => Boolean(env[name]?.trim());
  const live: string[] = [];

  const dokuId = env.DOKU_CLIENT_ID?.trim();
  if (dokuId && !dokuId.startsWith('test_mock_')) live.push('DOKU_CLIENT_ID');
  for (const name of ['DOKU_SECRET_KEY', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'WATI_API_KEY', 'SMTP_PASSWORD', 'INBOX_IMAP_PASSWORD']) {
    if (set(name)) live.push(name);
  }
  return live;
}
