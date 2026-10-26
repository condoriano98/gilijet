import { formatInTimeZone } from 'date-fns-tz';

/**
 * Two ways to put spend and bookings side by side, never confused:
 *
 * - period: spend incurred on dates in the range (ad-account local days) next
 *   to bookings paid in the range (payment time, in the business reporting
 *   timezone). A booking paid this week may come from last week's click; this
 *   is a period comparison, not attributed performance.
 * - cohort: bookings grouped by the date of their recorded eligible marketing
 *   touch. Bookings without a recorded touch time are counted as uncovered,
 *   never placed on their payment date.
 */
export type TimeBasis =
  | { model: 'period'; label: string; spendDates: 'ad_account_local'; bookingDates: 'payment_time'; reportTimezone: string; caveats: string[] }
  | { model: 'cohort'; label: string; cohortDates: 'last_touch_time'; reportTimezone: string; caveats: string[] };

export function periodBasis(reportTimezone: string, accountTimezones: string[]): TimeBasis {
  const caveats = ['Period comparison: bookings paid in the range are not necessarily acquired by spend in the range.'];
  const foreign = [...new Set(accountTimezones)].filter((tz) => tz !== reportTimezone);
  if (foreign.length) {
    caveats.push(`Spend days are ad-account local (${foreign.join(', ')}); bookings are bucketed in ${reportTimezone}. Daily spend cannot be re-split by hour.`);
  }
  return { model: 'period', label: 'Spend vs paid bookings in the same period', spendDates: 'ad_account_local', bookingDates: 'payment_time', reportTimezone, caveats };
}

export function cohortBasis(reportTimezone: string): TimeBasis {
  return {
    model: 'cohort',
    label: 'Bookings by acquisition (last eligible touch) date',
    cohortDates: 'last_touch_time',
    reportTimezone,
    caveats: ['Only bookings with a recorded touch time are placed; the rest are reported as uncovered.'],
  };
}

export function ymdIn(timezone: string, d: Date): string {
  return formatInTimeZone(d, timezone, 'yyyy-MM-dd');
}

export type CohortBooking<T> = { bookingId: string; lastTouchAt: Date | null; payload: T };

export function groupByAcquisitionDate<T>(
  bookings: CohortBooking<T>[],
  reportTimezone: string,
): { cohorts: Record<string, T[]>; uncovered: number; coverage: number | null } {
  const cohorts: Record<string, T[]> = {};
  let uncovered = 0;
  for (const b of bookings) {
    if (!b.lastTouchAt) {
      uncovered++;
      continue;
    }
    const day = ymdIn(reportTimezone, b.lastTouchAt);
    (cohorts[day] ??= []).push(b.payload);
  }
  return { cohorts, uncovered, coverage: bookings.length ? (bookings.length - uncovered) / bookings.length : null };
}
