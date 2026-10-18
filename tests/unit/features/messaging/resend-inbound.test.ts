import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyResendWebhook } from '@/features/messaging/resend-inbound';

const KEY = Buffer.from('super-secret-signing-key-123456');
const SECRET = `whsec_${KEY.toString('base64')}`;
const NOW = 1_800_000_000_000;

function sign(id: string, ts: number, body: string, key = KEY) {
  return `v1,${createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')}`;
}

function headers(id: string, ts: number, sig: string) {
  return new Headers({ 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': sig });
}

const BODY = '{"type":"email.received","data":{"email_id":"e1"}}';
const ts = NOW / 1000;

describe('verifyResendWebhook', () => {
  it('accepts a correctly signed body', () => {
    expect(
      verifyResendWebhook({ headers: headers('msg_1', ts, sign('msg_1', ts, BODY)), rawBody: BODY, secret: SECRET, nowMs: NOW }),
    ).toBe(true);
  });

  it('accepts when one of several signatures matches', () => {
    const sig = `v1,AAAA ${sign('msg_1', ts, BODY)}`;
    expect(verifyResendWebhook({ headers: headers('msg_1', ts, sig), rawBody: BODY, secret: SECRET, nowMs: NOW })).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(
      verifyResendWebhook({ headers: headers('msg_1', ts, sign('msg_1', ts, BODY)), rawBody: BODY + ' ', secret: SECRET, nowMs: NOW }),
    ).toBe(false);
  });

  it('rejects a signature made with another key', () => {
    const sig = sign('msg_1', ts, BODY, Buffer.from('other-key'));
    expect(verifyResendWebhook({ headers: headers('msg_1', ts, sig), rawBody: BODY, secret: SECRET, nowMs: NOW })).toBe(false);
  });

  it('rejects a stale timestamp (replay)', () => {
    const old = ts - 10 * 60;
    expect(
      verifyResendWebhook({ headers: headers('msg_1', old, sign('msg_1', old, BODY)), rawBody: BODY, secret: SECRET, nowMs: NOW }),
    ).toBe(false);
  });

  it('fails closed without a secret or without headers', () => {
    const h = headers('msg_1', ts, sign('msg_1', ts, BODY));
    expect(verifyResendWebhook({ headers: h, rawBody: BODY, secret: undefined, nowMs: NOW })).toBe(false);
    expect(verifyResendWebhook({ headers: new Headers(), rawBody: BODY, secret: SECRET, nowMs: NOW })).toBe(false);
  });
});
