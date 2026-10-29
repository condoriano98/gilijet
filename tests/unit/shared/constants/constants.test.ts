import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from '@/shared/constants/time';
import { DEFAULT_CURRENCY, DEFAULT_REPORT_TIMEZONE, OPERATOR_TIMEZONE } from '@/shared/constants/locale';
import {
  ADMIN_COOKIE,
  CUSTOMER_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_MAX_AGE_SECONDS,
  OPERATOR_COOKIE,
  SESSION_TTL_SECONDS,
} from '@/shared/constants/auth';
import { DEFAULT_COMMISSION_RATE, PLATFORM_CONFIG_ID } from '@/shared/constants/platform';
import { MONTH_NAMES_SHORT_ID } from '@/shared/constants/calendar';
import { DEFAULT_APP_BASE_URL } from '@/shared/constants/site';
import { ADMIN_LOGIN_PATH, CUSTOMER_LOGIN_PATH, OPERATOR_LOGIN_PATH } from '@/shared/constants/routes';
import { FULL_REFUND_WINDOW_HOURS, REFUND_CUTOFF_HOURS } from '@/features/refunds/constants';
import { computeRefundDeadline, refundTierForCustomer } from '@/features/refunds/refunds';
import { REVIEW_OPENS_AFTER_DEPARTURE_MS } from '@/features/booking/constants';
import { DEFAULT_LOOKAHEAD_DAYS } from '@/features/schedules/constants';
import {
  ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
  CONSENT_MAX_AGE_SECONDS,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE_SECONDS,
} from '@/features/marketing/constants';

/**
 * Every constant below was moved verbatim from an inline literal or a private
 * `const`. These assertions pin the old values, so a typo in a move (or a
 * later edit) shows up here instead of as changed behaviour.
 */
describe('time units', () => {
  it('converts exactly', () => {
    expect(MS_PER_SECOND).toBe(1000);
    expect(MS_PER_MINUTE).toBe(60 * 1000);
    expect(MS_PER_HOUR).toBe(60 * 60 * 1000);
    expect(MS_PER_DAY).toBe(24 * 60 * 60 * 1000);
    expect(SECONDS_PER_MINUTE).toBe(60);
    expect(SECONDS_PER_HOUR).toBe(3600);
    expect(SECONDS_PER_DAY).toBe(86_400);
  });
});

describe('locale and platform', () => {
  it('keeps the operator timezone, report timezone and currency', () => {
    expect(OPERATOR_TIMEZONE).toBe('Asia/Makassar');
    expect(DEFAULT_REPORT_TIMEZONE).toBe('Asia/Jakarta');
    expect(DEFAULT_CURRENCY).toBe('IDR');
  });

  it('keeps the commission default and the config row id', () => {
    expect(DEFAULT_COMMISSION_RATE).toBe(0.08);
    expect(String(DEFAULT_COMMISSION_RATE)).toBe('0.08');
    expect(PLATFORM_CONFIG_ID).toBe('default');
  });

  it('keeps the local base url and the Indonesian month names', () => {
    expect(DEFAULT_APP_BASE_URL).toBe('http://localhost:3000');
    expect(MONTH_NAMES_SHORT_ID).toHaveLength(12);
    expect(MONTH_NAMES_SHORT_ID[4]).toBe('Mei');
    expect(MONTH_NAMES_SHORT_ID[7]).toBe('Agu');
  });
});

describe('auth', () => {
  it('keeps cookie names, lifetimes and login paths', () => {
    expect(OPERATOR_COOKIE).toBe('gilifast_op');
    expect(ADMIN_COOKIE).toBe('gilifast_admin');
    expect(CUSTOMER_COOKIE).toBe('gilifast_cust');
    expect(GOOGLE_STATE_COOKIE).toBe('gilifast_google_state');
    expect(SESSION_TTL_SECONDS).toBe(60 * 60 * 24);
    expect(GOOGLE_STATE_MAX_AGE_SECONDS).toBe(60 * 10);
    expect(OPERATOR_LOGIN_PATH).toBe('/operator/login');
    expect(ADMIN_LOGIN_PATH).toBe('/admin/login');
    expect(CUSTOMER_LOGIN_PATH).toBe('/account/login');
  });
});

describe('domain policy', () => {
  it('keeps the refund cutoff at 48 hours and the full refund window at 7 days', () => {
    expect(REFUND_CUTOFF_HOURS).toBe(48);
    expect(FULL_REFUND_WINDOW_HOURS).toBe(168);
    const departure = new Date('2026-11-10T08:00:00Z');
    expect(departure.getTime() - computeRefundDeadline(departure).getTime()).toBe(48 * 60 * 60 * 1000);
    const at = (hoursBefore: number) => new Date(departure.getTime() - hoursBefore * MS_PER_HOUR);
    expect(refundTierForCustomer(at(169), departure)).toBe('FULL');
    expect(refundTierForCustomer(at(168), departure)).toBe('PARTIAL');
    expect(refundTierForCustomer(at(48), departure)).toBe('PARTIAL');
    expect(refundTierForCustomer(at(47), departure)).toBe('NONE');
  });

  it('keeps the review window, the lookahead and the marketing cookie lifetimes', () => {
    expect(REVIEW_OPENS_AFTER_DEPARTURE_MS).toBe(2 * 60 * 60 * 1000);
    expect(DEFAULT_LOOKAHEAD_DAYS).toBe(14);
    expect(VISITOR_COOKIE).toBe('gf_vid');
    expect(VISITOR_MAX_AGE_SECONDS).toBe(400 * 24 * 60 * 60);
    expect(ATTRIBUTION_COOKIE_MAX_AGE_SECONDS).toBe(90 * 24 * 60 * 60);
    expect(CONSENT_MAX_AGE_SECONDS).toBe(180 * 24 * 60 * 60);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const SRC = join(process.cwd(), 'src');
const CONSTANT_FILES = /^src\/shared\/constants\//;

function codeLines(file: string): { file: string; no: number; text: string }[] {
  const rel = relative(process.cwd(), file);
  if (CONSTANT_FILES.test(rel)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((text, i) => ({ file: rel, no: i + 1, text }))
    .filter(({ text }) => !/^\s*(\/\/|\*|\/\*)/.test(text));
}

describe('guard: no inline literals for shared values', () => {
  const lines = sourceFiles(SRC).flatMap(codeLines);
  const offenders = (pattern: RegExp) =>
    lines.filter(({ text }) => pattern.test(text)).map(({ file, no }) => `${file}:${no}`);

  it('has no inline time arithmetic outside shared/constants', () => {
    expect(offenders(/\b60 \* 1000\b|\b1000 \* 60\b|\b24 \* 60 \* 60\b|\b60 \* 60 \* 24\b/)).toEqual([]);
  });

  it('has no Asia/Makassar, Asia/Jakarta or currency literal outside shared/constants', () => {
    expect(offenders(/'Asia\/Makassar'|'Asia\/Jakarta'|'IDR'/)).toEqual([]);
  });

  it('has one definition of the refund cutoff: the booking page uses the constant', () => {
    const page = readFileSync(
      join(SRC, 'app/(customer)/[locale]/b/[reference]/page.tsx'),
      'utf8',
    );
    expect(page).toContain('REFUND_CUTOFF_HOURS');
    expect(page).not.toMatch(/\b48 \* MS_PER_HOUR\b/);
  });
});
