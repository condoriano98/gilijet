import { test, expect, type Page } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { expectNoHorizontalOverflow } from './support/overflow';
import { removeSchedules } from './support/fixtures';

loadEnvConfig(process.cwd());

/**
 * Search results page: sort, time-slot and max-price filters, the empty and
 * incomplete-query states, the passenger count on the Book link, and a phone
 * width check with real results on screen. Read-only: it creates no booking and
 * never reaches checkout.
 *
 * Own route in 2089, three departures on one day, removed afterwards. Prices,
 * times and durations are chosen so that each sort order gives a different
 * result. Times are WITA (UTC+8): 00:00Z is 08:00, 06:00Z is 14:00, 11:00Z is
 * 19:00. Relies on `pnpm seed:qa` (QA boat).
 *
 *   morning   08:00  Rp 250.000  90 min
 *   afternoon 14:00  Rp 400.000  45 min
 *   evening   19:00  Rp 100.000  60 min
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Filt Origin';
const DESTINATION = 'E2E Filt Dest';
const DATE = '2089-06-12';
const EMPTY_DATE = '2089-06-13';

// `scheduleTime` only has to differ per row: boat + route + departureTime is unique.
const DEPARTURES = [
  { slot: 'morning', time: '00:00', scheduleTime: '08:00', price: 250_000, minutes: 90 },
  { slot: 'afternoon', time: '06:00', scheduleTime: '14:00', price: 400_000, minutes: 45 },
  { slot: 'evening', time: '11:00', scheduleTime: '19:00', price: 100_000, minutes: 60 },
] as const;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await removeSchedules(prisma, [ORIGIN]);
  const boat = await prisma.boat.findUniqueOrThrow({ where: { registrationNumber: 'QA-BOAT-001' } });
  for (const d of DEPARTURES) {
    const schedule = await prisma.schedule.create({
      data: {
        boatId: boat.id,
        originPort: ORIGIN,
        destinationPort: DESTINATION,
        departureTime: d.scheduleTime,
        durationMinutes: d.minutes,
        basePrice: d.price,
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        status: 'ACTIVE',
      },
    });
    await prisma.leg.create({
      data: {
        scheduleId: schedule.id,
        operatorId: boat.operatorId,
        departureDate: new Date(`${DATE}T${d.time}:00Z`),
        basePrice: d.price,
        status: 'OPEN',
      },
    });
  }
});

test.afterAll(async () => {
  await removeSchedules(prisma, [ORIGIN]);
  await prisma.$disconnect();
});

const searchUrl = (extra = '', date = DATE) =>
  `/search?origin=${encodeURIComponent(ORIGIN)}&destination=${encodeURIComponent(DESTINATION)}&date=${date}&passengers=1${extra}`;

/** The Rp amounts on the Book links, in the order the results are listed. */
async function listedPrices(page: Page): Promise<number[]> {
  const links = page.getByRole('link', { name: /^Book \d/ });
  await expect(links.first()).toBeVisible({ timeout: 15_000 });
  const names = await links.allInnerTexts();
  return names.map((n) => Number((n.match(/Rp\s*([\d.]+)/)?.[1] ?? '').replace(/\./g, '')));
}

test('BOOK-S01 default order is by departure time', async ({ page }) => {
  await page.goto(searchUrl());
  expect(await listedPrices(page)).toEqual([250_000, 400_000, 100_000]);
  await expect(page.getByText('08:00').first()).toBeVisible();
  await expect(page.getByText('19:00').first()).toBeVisible();
});

test('BOOK-S02 sort by price lists the cheapest first', async ({ page }) => {
  await page.goto(searchUrl());
  await page.getByRole('button', { name: 'Price (low to high)' }).click();
  await page.waitForURL(/sortBy=price/, { timeout: 15_000 });
  expect(await listedPrices(page)).toEqual([100_000, 250_000, 400_000]);
});

test('BOOK-S03 sort by duration lists the shortest trip first', async ({ page }) => {
  await page.goto(searchUrl());
  await page.getByRole('button', { name: 'Duration (shortest)' }).click();
  await page.waitForURL(/sortBy=duration/, { timeout: 15_000 });
  expect(await listedPrices(page)).toEqual([400_000, 100_000, 250_000]);
});

for (const c of [
  { label: /^Morning/, param: 'morning', prices: [250_000] },
  { label: /^Afternoon/, param: 'afternoon', prices: [400_000] },
  { label: /^Evening/, param: 'evening', prices: [100_000] },
]) {
  test(`BOOK-S04 time slot ${c.param} keeps only that departure`, async ({ page }) => {
    await page.goto(searchUrl());
    await page.getByRole('button', { name: c.label }).click();
    await page.waitForURL(new RegExp(`timeSlot=${c.param}`), { timeout: 15_000 });
    expect(await listedPrices(page)).toEqual(c.prices);
  });
}

test('BOOK-S05 max price filter hides departures above the limit', async ({ page }) => {
  await page.goto(searchUrl());
  await page.getByLabel(/Max price per passenger/).fill('300000');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.waitForURL(/maxPrice=300000/, { timeout: 15_000 });
  expect(await listedPrices(page)).toEqual([250_000, 100_000]);
});

test('BOOK-S06 filters that match nothing say so, and Clear all brings the results back', async ({ page }) => {
  await page.goto(searchUrl('&maxPrice=50000'));
  await expect(page.getByText(/No departures match your filters/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.waitForURL((u) => !u.search.includes('maxPrice'), { timeout: 15_000 });
  expect(await listedPrices(page)).toEqual([250_000, 400_000, 100_000]);
});

test('BOOK-S07 a day with no departures shows the empty state', async ({ page }) => {
  await page.goto(searchUrl('', EMPTY_DATE));
  await expect(page.getByText(/No departures on this date/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: /^Book \d/ })).toHaveCount(0);
});

test('BOOK-S08 an incomplete query asks for the missing port instead of failing', async ({ page }) => {
  await page.goto('/search?origin=Sanur');
  await expect(page.getByText('Pick a destination to see boats from Sanur.')).toBeVisible({ timeout: 15_000 });
  await page.goto(`/search?destination=${encodeURIComponent(DESTINATION)}`);
  // No origin is allowed ("any port"), so this one lists boats rather than nudging.
  await expect(page.getByRole('heading', { name: new RegExp(`Boats to ${DESTINATION}`) })).toBeVisible({ timeout: 15_000 });
});

test('BOOK-S09 the passenger count carries into the Book link and its total', async ({ page }) => {
  await page.goto(searchUrl().replace('passengers=1', 'passengers=3') + '&timeSlot=morning');
  const link = page.getByRole('link', { name: /^Book 3/ });
  await expect(link).toBeVisible({ timeout: 15_000 });
  await expect(link).toContainText('Rp 750.000');
  await expect(link).toHaveAttribute('href', /passengers=3/);
});

test('BOOK-S10 at phone width the results list does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(searchUrl());
  expect((await listedPrices(page)).length).toBe(3);
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, `search results overflow by ${scroll - client}px at 375px`).toBeLessThanOrEqual(client + 1);
});

test('BOOK-M03 the results page fits the screen', async ({ page }) => {
  await page.goto(`/search?origin=${encodeURIComponent(ORIGIN)}&destination=${encodeURIComponent(DESTINATION)}&date=${DATE}&passengers=1`);
  await expect(page.getByRole('link', { name: /^Book 1/ }).first()).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalOverflow(page);
});
