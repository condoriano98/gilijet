import { test, expect, type Page } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { requireMockPayments } from './support/mock-payments';
import { removeSchedules } from './support/fixtures';

loadEnvConfig(process.cwd());
requireMockPayments();

/**
 * Search results that the other search specs leave out: the round-trip selector
 * with the sort and time-slot filters (BOOK-G01), the "Via connections" cards
 * (BOOK-G02) and the sea-condition badge (BOOK-G03). Reads only; nothing is
 * booked. Own ports, one route per case, far-future dates, removed afterwards.
 * Relies on `pnpm seed:qa` (QA boat).
 */
const prisma = new PrismaClient();

const RT_FROM = 'E2E RtFilter Origin';
const RT_TO = 'E2E RtFilter Dest';
const RT_OUT_DATE = '2089-07-10';
const RT_RET_DATE = '2089-07-12';

const CONN_A = 'E2E Conn A';
const CONN_T = 'E2E Conn T';
const CONN_B = 'E2E Conn B';
const CONN_A2 = 'E2E Conn A2';
const CONN_B2 = 'E2E Conn B2';
const CONN_DATE = '2089-07-14';

const NO_SEA = ['E2E Sea X', 'E2E Sea Y'] as const;
const NO_LEGS_DATE = '2089-07-20';

/** The sheet's fares: a round-trip leg is charged half of the return ("pair") fare. */
const matrix = (adult: number, pair: number) => {
  const cells = (a: number) => {
    const cell = { adult: a, child: a / 2, infant: 0 };
    return { low: cell, high: cell, peak: cell };
  };
  return { oneWay: cells(adult), return: cells(pair) };
};

// time = UTC (WITA is +8): 00:00Z = 08:00, 06:00Z = 14:00. `sched` only has to differ per row.
const OUT = [
  { time: '00:00', sched: '08:00', pair: 300_000 }, // leg 150.000
  { time: '06:00', sched: '14:00', pair: 200_000 }, // leg 100.000
] as const;
const RET = [
  { time: '00:00', sched: '08:00', pair: 260_000 }, // leg 130.000
  { time: '06:00', sched: '14:00', pair: 180_000 }, // leg 90.000
] as const;

let boatId = '';
let operatorId = '';

async function addLeg(opts: {
  origin: string;
  destination: string;
  ymd: string;
  time: string;
  sched: string;
  minutes?: number;
  adult: number;
  pair?: number;
}) {
  const schedule = await prisma.schedule.create({
    data: {
      boatId,
      originPort: opts.origin,
      destinationPort: opts.destination,
      departureTime: opts.sched,
      durationMinutes: opts.minutes ?? 45,
      basePrice: opts.adult,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      status: 'ACTIVE',
      fareMatrix: matrix(opts.adult, opts.pair ?? opts.adult * 2),
    },
  });
  return prisma.leg.create({
    data: {
      scheduleId: schedule.id,
      operatorId,
      departureDate: new Date(`${opts.ymd}T${opts.time}:00Z`),
      basePrice: opts.adult,
      status: 'OPEN',
    },
  });
}

const ALL_ORIGINS = [RT_FROM, RT_TO, CONN_A, CONN_T, CONN_B, CONN_A2, CONN_B2];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await removeSchedules(prisma, ALL_ORIGINS);
  const boat = await prisma.boat.findUniqueOrThrow({ where: { registrationNumber: 'QA-BOAT-001' } });
  boatId = boat.id;
  operatorId = boat.operatorId;

  for (const d of OUT) {
    await addLeg({ origin: RT_FROM, destination: RT_TO, ymd: RT_OUT_DATE, time: d.time, sched: d.sched, adult: d.pair / 2, pair: d.pair });
  }
  for (const d of RET) {
    await addLeg({ origin: RT_TO, destination: RT_FROM, ymd: RT_RET_DATE, time: d.time, sched: d.sched, adult: d.pair / 2, pair: d.pair });
  }

  // A -> T leaves 09:00 WITA and takes 45 min; T -> B leaves 11:00 WITA: a 75 min wait.
  await addLeg({ origin: CONN_A, destination: CONN_T, ymd: CONN_DATE, time: '01:00', sched: '09:00', minutes: 45, adult: 100_000 });
  await addLeg({ origin: CONN_T, destination: CONN_B, ymd: CONN_DATE, time: '03:00', sched: '11:00', minutes: 30, adult: 80_000 });
  // A2 -> T leaves 09:00 and takes 45 min; T -> B2 leaves 09:55: only 10 min after arrival,
  // under the 45 min minimum transfer, so no connection may be offered.
  await addLeg({ origin: CONN_A2, destination: CONN_T, ymd: CONN_DATE, time: '01:00', sched: '09:01', minutes: 45, adult: 100_000 });
  await addLeg({ origin: CONN_T, destination: CONN_B2, ymd: CONN_DATE, time: '01:55', sched: '09:55', minutes: 30, adult: 80_000 });
});

test.afterAll(async () => {
  await removeSchedules(prisma, ALL_ORIGINS);
  await prisma.$disconnect();
});

const rtUrl = (extra = '') =>
  `/search?origin=${encodeURIComponent(RT_FROM)}&destination=${encodeURIComponent(RT_TO)}` +
  `&date=${RT_OUT_DATE}&returnDate=${RT_RET_DATE}&passengers=2${extra}`;

/** The leg buttons under the "Outbound" or "Return" heading. */
const list = (page: Page, heading: 'Outbound' | 'Return') =>
  page.getByRole('heading', { name: heading }).locator('xpath=following-sibling::*[1]').getByRole('button');

async function waitForLists(page: Page) {
  await expect(page.getByRole('heading', { name: 'Outbound' })).toBeVisible({ timeout: 15_000 });
}

test('BOOK-G01 round-trip search: the Afternoon filter narrows both lists', async ({ page }) => {
  await page.goto(rtUrl());
  await waitForLists(page);
  await expect(list(page, 'Outbound')).toHaveCount(2);
  await expect(list(page, 'Return')).toHaveCount(2);

  await page.getByRole('button', { name: /^Afternoon/ }).click();
  await expect(page).toHaveURL(/timeSlot=afternoon/, { timeout: 15_000 });
  // The return date and passenger count survive the filter.
  await expect(page).toHaveURL(new RegExp(`returnDate=${RT_RET_DATE}`));
  await waitForLists(page);
  await expect(list(page, 'Outbound')).toHaveCount(1);
  await expect(list(page, 'Outbound').first()).toContainText('14:00');
  await expect(list(page, 'Return')).toHaveCount(1);
  await expect(list(page, 'Return').first()).toContainText('14:00');
});

test('BOOK-G01b round-trip search: sorting by price puts the cheaper departure first in both lists', async ({ page }) => {
  await page.goto(rtUrl('&sortBy=price'));
  await waitForLists(page);
  await expect(list(page, 'Outbound').first()).toContainText('14:00');
  await expect(list(page, 'Outbound').first()).toContainText('Rp 100.000');
  await expect(list(page, 'Return').first()).toContainText('14:00');
  await expect(list(page, 'Return').first()).toContainText('Rp 90.000');

  // Without a sort the order is by time.
  await page.goto(rtUrl());
  await waitForLists(page);
  await expect(list(page, 'Outbound').first()).toContainText('08:00');
  await expect(list(page, 'Return').first()).toContainText('08:00');
});

test('BOOK-G01c round-trip search: Continue to Booking carries both leg ids and the passenger count', async ({ page }) => {
  await page.goto(rtUrl('&timeSlot=afternoon'));
  await waitForLists(page);
  await list(page, 'Outbound').first().click();
  await list(page, 'Return').first().click();
  // 100.000 + 90.000 per passenger, two passengers.
  await expect(page.getByText('Rp 380.000').first()).toBeVisible();

  const outbound = await prisma.leg.findFirstOrThrow({
    where: { schedule: { originPort: RT_FROM }, departureDate: new Date(`${RT_OUT_DATE}T06:00:00Z`) },
  });
  const ret = await prisma.leg.findFirstOrThrow({
    where: { schedule: { originPort: RT_TO }, departureDate: new Date(`${RT_RET_DATE}T06:00:00Z`) },
  });
  const link = page.getByRole('link', { name: 'Continue to Booking' });
  await expect(link).toHaveAttribute('href', new RegExp(`outboundLegId=${outbound.id}`));
  await expect(link).toHaveAttribute('href', new RegExp(`returnLegId=${ret.id}`));
  await expect(link).toHaveAttribute('href', /passengers=2/);
  await link.click();
  await page.waitForURL(/\/book\/0\?/, { timeout: 15_000 });
  await expect(page.locator('input[name="outboundLegId"]')).toHaveValue(outbound.id);
  await expect(page.locator('input[name="returnLegId"]')).toHaveValue(ret.id);
});

test('BOOK-G01d round-trip search: Continue to Booking appears only once both legs are picked', async ({ page }) => {
  await page.goto(rtUrl());
  await waitForLists(page);
  const link = page.getByRole('link', { name: 'Continue to Booking' });
  await expect(link).toHaveCount(0);
  await list(page, 'Outbound').first().click();
  await expect(link).toHaveCount(0);
  await list(page, 'Return').first().click();
  await expect(link).toBeVisible();
});

test('BOOK-G02 a route with a transfer port lists the connection with its wait and total, and Book leg 1 first opens leg 1', async ({ page }) => {
  await page.goto(`/search?origin=${encodeURIComponent(CONN_A)}&destination=${encodeURIComponent(CONN_B)}&date=${CONN_DATE}&passengers=1`);
  // There is no direct boat, only the connection.
  await expect(page.getByText(/No departures on this date/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Via connections' })).toBeVisible();
  await expect(page.getByText(`Transfer at ${CONN_T}`)).toBeVisible();
  await expect(page.getByText(/75 min wait/)).toBeVisible();
  await expect(page.getByText(/h \d+m total/)).toBeVisible();
  await expect(page.getByText('Rp 180.000').first()).toBeVisible();

  const leg1 = await prisma.leg.findFirstOrThrow({
    where: { schedule: { originPort: CONN_A }, departureDate: new Date(`${CONN_DATE}T01:00:00Z`) },
  });
  await expect(page.getByRole('link', { name: 'Book leg 1 first' })).toHaveAttribute('href', `/book/${leg1.id}?passengers=1`);
});

// Bug B16 (docs/spikes/in-progress/BUGS_QA_BASELINE_FINDINGS.md): the card prints
// `~${Math.round(minutes / 60)}h ${minutes % 60}m`, so 150 minutes reads "~3h 30m".
// Remove test.fail when the hours are floored.
test('BOOK-G02c the connection total is the real duration: 45 + 75 + 30 minutes is 2h 30m', async ({ page }) => {
  test.fail(true, 'B16: the connection card rounds the hours up and keeps the minutes (150 min reads ~3h 30m)');
  await page.goto(`/search?origin=${encodeURIComponent(CONN_A)}&destination=${encodeURIComponent(CONN_B)}&date=${CONN_DATE}&passengers=1`);
  await expect(page.getByRole('heading', { name: 'Via connections' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/2h 30m total/)).toBeVisible({ timeout: 3_000 });
});

test('BOOK-G02b a second boat that leaves less than 45 minutes after arrival is not offered as a connection', async ({ page }) => {
  await page.goto(`/search?origin=${encodeURIComponent(CONN_A2)}&destination=${encodeURIComponent(CONN_B2)}&date=${CONN_DATE}&passengers=1`);
  await expect(page.getByText(/No departures on this date/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Via connections' })).toHaveCount(0);
});

test('BOOK-G03 a route with a known sea condition shows its badge (Bangsal to Gili Air: calm)', async ({ page }) => {
  await page.goto(`/search?origin=Bangsal&destination=${encodeURIComponent('Gili Air')}&date=${NO_LEGS_DATE}&passengers=1`);
  await expect(page.getByRole('heading', { name: /Bangsal → Gili Air/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Calm seas', { exact: true })).toBeVisible();
});

// Bug B15 (docs/spikes/in-progress/BUGS_QA_BASELINE_FINDINGS.md): the lookup sorts the two port
// names before it reads the table, but most keys in the table are written unsorted
// ("Sanur|Nusa Penida"), so the badge never shows for them. Remove test.fail when it is fixed.
test('BOOK-G03b the badge is shown for Sanur to Nusa Penida, in either direction', async ({ page }) => {
  test.fail(true, 'B15: sea-condition keys are written unsorted but looked up sorted, so most routes show no badge');
  for (const [from, to] of [['Sanur', 'Nusa Penida'], ['Nusa Penida', 'Sanur']]) {
    await page.goto(`/search?origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&date=${NO_LEGS_DATE}&passengers=1`);
    await expect(page.getByRole('heading', { name: new RegExp(`${from} → ${to}`) })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Calm seas', { exact: true }), `${from} → ${to}`).toBeVisible({ timeout: 3_000 });
  }
});

test('BOOK-G03c a route that is not in the sea-condition table shows no badge', async ({ page }) => {
  await page.goto(`/search?origin=${encodeURIComponent(NO_SEA[0])}&destination=${encodeURIComponent(NO_SEA[1])}&date=${NO_LEGS_DATE}&passengers=1`);
  await expect(page.getByRole('heading', { name: new RegExp(`${NO_SEA[0]} → ${NO_SEA[1]}`) })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Calm seas|Moderate sw|Moderate seas|Rough/)).toHaveCount(0);
});
