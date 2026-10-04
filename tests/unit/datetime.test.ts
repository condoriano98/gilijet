import { describe, it, expect } from 'vitest';
import {
  OPERATOR_TIMEZONE,
  localDateTimeToUtc,
  formatLocalDate,
  formatLocalTime,
  formatLocalDateTime,
  isoDayOfWeek,
  ymdInZone,
} from '@/lib/datetime';

/**
 * Unit tests for lib/datetime.ts
 *
 * Tests WITA (Asia/Makassar, UTC+8) timezone handling:
 * - Local date/time conversion (WITA ↔ UTC)
 * - Display formatting in operator timezone
 * - ISO day-of-week calculation
 * - YYYY-MM-DD date string generation
 *
 * No mocking needed — pure date-fns-tz functions.
 */

describe('OPERATOR_TIMEZONE', () => {
  it('is set to Asia/Makassar (UTC+8)', () => {
    expect(OPERATOR_TIMEZONE).toBe('Asia/Makassar');
  });
});

describe('localDateTimeToUtc', () => {
  it('converts WITA midnight to UTC', () => {
    const utc = localDateTimeToUtc('2026-05-25', '00:00');

    // 2026-05-25 00:00 WITA = 2026-05-24 16:00 UTC (WITA is UTC+8)
    expect(utc.toISOString()).toContain('2026-05-24T16:00:00');
  });

  it('converts WITA noon to UTC', () => {
    const utc = localDateTimeToUtc('2026-05-25', '12:00');

    // 2026-05-25 12:00 WITA = 2026-05-25 04:00 UTC
    expect(utc.toISOString()).toContain('2026-05-25T04:00:00');
  });

  it('handles different times of day', () => {
    const morning = localDateTimeToUtc('2026-05-25', '08:00');
    const evening = localDateTimeToUtc('2026-05-25', '20:00');

    expect(morning.getTime()).toBeLessThan(evening.getTime());
  });
});

describe('formatLocalDate', () => {
  it('formats UTC date in WITA timezone', () => {
    const utc = new Date('2026-05-25T04:00:00Z');

    const formatted = formatLocalDate(utc);

    expect(formatted).toContain('May'); // Or locale month name
    expect(formatted).toContain('2026');
  });

  it('handles string input', () => {
    const formatted = formatLocalDate('2026-05-25T04:00:00Z');

    expect(formatted).toContain('2026');
  });

  it('accepts custom format pattern', () => {
    const utc = new Date('2026-05-25T04:00:00Z');

    const formatted = formatLocalDate(utc, 'dd/MM/yyyy');

    expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});

describe('formatLocalTime', () => {
  it('formats UTC time in WITA timezone (HH:mm)', () => {
    const utc = new Date('2026-05-25T04:00:00Z');

    const formatted = formatLocalTime(utc);

    // 2026-05-25 04:00 UTC = 2026-05-25 12:00 WITA
    expect(formatted).toMatch(/\d{2}:\d{2}/);
    expect(formatted).toContain('12');
  });

  it('handles string input', () => {
    const formatted = formatLocalTime('2026-05-25T04:00:00Z');

    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });
});

describe('formatLocalDateTime', () => {
  it('formats UTC datetime in WITA timezone', () => {
    const utc = new Date('2026-05-25T04:00:00Z');

    const formatted = formatLocalDateTime(utc);

    // Should contain date AND time
    expect(formatted).toContain('2026');
    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });

  it('handles string input', () => {
    const formatted = formatLocalDateTime('2026-05-25T04:00:00Z');

    expect(formatted).toContain('2026');
  });
});

describe('isoDayOfWeek', () => {
  it('returns 1 for Monday in WITA timezone', () => {
    // 2026-05-25 is a Monday in UTC
    // In WITA (UTC+8), it's still Monday (earlier in the day)
    const monday = new Date('2026-05-25T00:00:00Z');

    const dow = isoDayOfWeek(monday);

    expect(dow).toBe(1); // Monday
  });

  it('returns 7 for Sunday', () => {
    // 2026-05-24 is a Sunday
    const sunday = new Date('2026-05-24T00:00:00Z');

    const dow = isoDayOfWeek(sunday);

    expect(dow).toBe(7); // Sunday
  });

  it('returns correct day across UTC boundary', () => {
    // 2026-05-25 16:00 UTC = 2026-05-26 00:00 WITA (Tuesday morning)
    const utc = new Date('2026-05-25T16:00:00Z');

    const dow = isoDayOfWeek(utc);

    expect(dow).toBe(2); // Tuesday in WITA
  });
});

describe('ymdInZone', () => {
  it('returns YYYY-MM-DD in WITA timezone', () => {
    const utc = new Date('2026-05-25T04:00:00Z');

    const ymd = ymdInZone(utc);

    expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ymd).toBe('2026-05-25');
  });

  it('handles UTC midnight correctly', () => {
    const utc = new Date('2026-05-25T00:00:00Z');

    const ymd = ymdInZone(utc);

    // 2026-05-25 00:00 UTC = 2026-05-25 08:00 WITA (still same day)
    expect(ymd).toBe('2026-05-25');
  });

  it('handles UTC→WITA day boundary', () => {
    // 2026-05-25 16:00 UTC = 2026-05-26 00:00 WITA (next day)
    const utc = new Date('2026-05-25T16:00:00Z');

    const ymd = ymdInZone(utc);

    expect(ymd).toBe('2026-05-26');
  });
});
