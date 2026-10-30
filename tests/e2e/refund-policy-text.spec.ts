import { test, expect } from '@playwright/test';
import {
  REFUND_CUTOFF_HOURS,
  FULL_REFUND_WINDOW_HOURS,
} from '../../src/features/refunds/constants';

/**
 * /refunds and /change-plans type the tier hours into their copy by hand. This
 * spec reads the constants the refund engine uses and checks the pages still
 * say the same numbers, so a changed cutoff cannot leave the policy pages
 * telling customers something else. Reads only. Case IDs are in the QA matrix.
 */
const FULL_DAYS = FULL_REFUND_WINDOW_HOURS / 24;

test('CONT-024 /refunds tier text matches the constants', async ({ page }) => {
  await page.goto('/refunds');
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  expect(text).toContain(`More than ${FULL_DAYS} days (>${FULL_REFUND_WINDOW_HOURS} hours) before departure`);
  expect(text).toContain(`${REFUND_CUTOFF_HOURS} hours to ${FULL_DAYS} days before departure`);
  expect(text).toContain(`Less than ${REFUND_CUTOFF_HOURS} hours before departure`);
});

test('CONT-025 /change-plans tier text matches the constants', async ({ page }) => {
  await page.goto('/change-plans');
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  expect(text).toContain(`More than ${FULL_DAYS} days (>${FULL_REFUND_WINDOW_HOURS} hrs) before departure`);
  expect(text).toContain(`${REFUND_CUTOFF_HOURS} hours to ${FULL_DAYS} days before departure`);
  expect(text).toContain(`Less than ${REFUND_CUTOFF_HOURS} hours before departure`);
  expect(text).toContain(`more than ${REFUND_CUTOFF_HOURS} hours away`);
});
