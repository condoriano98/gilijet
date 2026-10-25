import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  countInboundMessages,
  extractStatuses,
  verifyChallenge,
  verifySignature,
} from '@/features/messaging/whatsapp-webhook';

const params = (o: Record<string, string>) => new URLSearchParams(o);
const sign = (body: string, secret: string) =>
  'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

describe('verifyChallenge', () => {
  const ok = { 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '12345' };

  it('echoes the challenge when mode and token match', () => {
    expect(verifyChallenge(params(ok), 'tok')).toBe('12345');
  });

  it('refuses a wrong token, a wrong mode, a missing challenge and an unset token', () => {
    expect(verifyChallenge(params({ ...ok, 'hub.verify_token': 'nope' }), 'tok')).toBeNull();
    expect(verifyChallenge(params({ ...ok, 'hub.mode': 'unsubscribe' }), 'tok')).toBeNull();
    expect(verifyChallenge(params({ ...ok, 'hub.challenge': '' }), 'tok')).toBeNull();
    expect(verifyChallenge(params(ok), undefined)).toBeNull();
    expect(verifyChallenge(params(ok), '  ')).toBeNull();
  });

  it('tolerates surrounding whitespace in the configured token', () => {
    expect(verifyChallenge(params(ok), ' tok ')).toBe('12345');
  });
});

describe('verifySignature', () => {
  const body = '{"object":"whatsapp_business_account"}';

  it('accepts a signature made with the app secret over the raw body', () => {
    expect(verifySignature(body, sign(body, 's3cret'), 's3cret')).toBe(true);
  });

  it('rejects a tampered body, a wrong secret, a missing header and an unset secret', () => {
    expect(verifySignature(body + ' ', sign(body, 's3cret'), 's3cret')).toBe(false);
    expect(verifySignature(body, sign(body, 'other'), 's3cret')).toBe(false);
    expect(verifySignature(body, null, 's3cret')).toBe(false);
    expect(verifySignature(body, 'abc', 's3cret')).toBe(false);
    expect(verifySignature(body, sign(body, 's3cret'), undefined)).toBe(false);
  });
});

describe('extractStatuses / countInboundMessages', () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                { id: 'wamid.A', status: 'delivered', timestamp: '1', recipient_id: '6285246052359' },
                {
                  id: 'wamid.B',
                  status: 'failed',
                  timestamp: '2',
                  errors: [{ code: 131026, title: 'Message undeliverable' }],
                },
              ],
              messages: [{ id: 'wamid.C', text: { body: 'hello' } }],
            },
          },
        ],
      },
    ],
  };

  it('reads statuses and the failure reason, and drops the recipient number', () => {
    const out = extractStatuses(payload);
    expect(out).toEqual([
      { id: 'wamid.A', status: 'delivered', timestamp: '1', error: null },
      { id: 'wamid.B', status: 'failed', timestamp: '2', error: '131026 Message undeliverable' },
    ]);
    expect(JSON.stringify(out)).not.toContain('6285246052359');
  });

  it('counts inbound messages without keeping them', () => {
    expect(countInboundMessages(payload)).toBe(1);
  });

  it('survives payloads of the wrong shape', () => {
    expect(extractStatuses(null)).toEqual([]);
    expect(extractStatuses({ entry: 'x' })).toEqual([]);
    expect(countInboundMessages({})).toBe(0);
  });
});
