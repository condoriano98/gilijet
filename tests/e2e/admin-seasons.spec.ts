import { test, expect, type Page } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';

loadEnvConfig(process.cwd());

/**
 * Admin side of seasonal pricing: the Seasons tab (add, validate, delete) and
 * the per-departure price override that must opt a leg out of its season.
 *
 * Own fixtures in 2098/2097, removed afterwards. Relies on `pnpm seed:qa`.
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Admin Origin';
const DESTINATION = 'E2E Admin Dest';
const NOTE = 'e2e-admin-seasons';
const SEASON_ID = 'e2e-admin-season-high';

const fares = (adult: number) => ({ adult, child: adult / 2, infant: 0 });
const FARE_MATRIX = {
  oneWay: { low: fares(100_000), high: fares(150_000), peak: fares(200_000) },
  return: { low: fares(100_000), high: fares(150_000), peak: fares(200_000) },
};

let seasonLegId: string;
let overrideLegId: string;

async function cleanup() {
  const schedules = await prisma.schedule.findMany({
    where: { originPort: ORIGIN, destinationPort: DESTINATION },
    select: { id: true },
  });
  const ids = schedules.map((s) => s.id);
  await prisma.leg.deleteMany({ where: { scheduleId: { in: ids } } });
  await prisma.schedule.deleteMany({ where: { id: { in: ids } } });
  await prisma.season.deleteMany({ where: { OR: [{ id: SEASON_ID }, { note: NOTE }] } });
}

async function loginAsAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel(/email/i).fill('qa-admin@gilifast.local');
  await page.getByLabel(/password/i).fill('qaqaqaqa');
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  await page.waitForURL(/\/admin(\/|$)(?!login)/, { timeout: 20_000 });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await cleanup();
  const boat = await prisma.boat.findUniqueOrThrow({ where: { registrationNumber: 'QA-BOAT-001' } });
  const schedule = await prisma.schedule.create({
    data: {
      boatId: boat.id,
      originPort: ORIGIN,
      destinationPort: DESTINATION,
      departureTime: '09:00',
      durationMinutes: 45,
      basePrice: 100_000,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      status: 'ACTIVE',
      fareMatrix: FARE_MATRIX,
    },
  });
  await prisma.season.create({
    data: {
      id: SEASON_ID,
      type: 'HIGH',
      startDate: new Date('2097-06-10T00:00:00Z'),
      endDate: new Date('2097-06-20T00:00:00Z'),
      note: NOTE,
    },
  });
  const mk = (ymd: string) =>
    prisma.leg.create({
      data: {
        scheduleId: schedule.id,
        operatorId: boat.operatorId,
        departureDate: new Date(`${ymd}T01:00:00Z`),
        basePrice: 100_000,
        status: 'OPEN',
      },
    });
  seasonLegId = (await mk('2097-06-12')).id;
  overrideLegId = (await mk('2097-06-14')).id;
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test('the Seasons tab is not reachable without an admin session', async ({ page }) => {
  await page.goto('/admin/console/seasons');
  await expect(page).toHaveURL(/\/admin\/login/, { timeout: 15_000 });
});

test('super admin can add, reject a bad range, and delete a season', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/console/seasons');
  await expect(page.getByRole('heading', { name: 'Seasons', exact: true })).toBeVisible({ timeout: 15_000 });

  // Bad range: the server must refuse it, not the browser.
  await page.locator('#type').selectOption('PEAK');
  await page.locator('#startDate').fill('2098-03-10');
  await page.locator('#endDate').fill('2098-03-05');
  await page.locator('#note').fill(NOTE);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('body')).toContainText(/End date cannot be before start date/i, { timeout: 15_000 });
  expect(await prisma.season.count({ where: { note: NOTE, startDate: new Date('2098-03-10T00:00:00Z') } })).toBe(0);

  // Valid range.
  await page.locator('#type').selectOption('PEAK');
  await page.locator('#startDate').fill('2098-03-05');
  await page.locator('#endDate').fill('2098-03-10');
  await page.locator('#note').fill(NOTE);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: '2098-03-05' });
  await expect(row).toContainText('PEAK', { timeout: 15_000 });
  await expect(row).toContainText('2098-03-10');
  await expect(row).toContainText(NOTE);

  // Deactivate hides it from the resolver but keeps the row.
  await row.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByRole('row').filter({ hasText: '2098-03-05' })).toContainText('Inactive', { timeout: 15_000 });

  // Delete is a soft-delete: gone from the list, kept for audit.
  await page.getByRole('row').filter({ hasText: '2098-03-05' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('row').filter({ hasText: '2098-03-05' })).toHaveCount(0, { timeout: 15_000 });
  const stored = await prisma.season.findFirstOrThrow({ where: { note: NOTE, startDate: new Date('2098-03-05T00:00:00Z') } });
  expect(stored.deletedAt).not.toBeNull();
  expect(stored.isActive).toBe(false);
  expect(
    await prisma.auditLog.count({ where: { entityType: 'SEASON', entityId: stored.id } }),
  ).toBeGreaterThanOrEqual(3);
});

test('a manual price override opts the departure out of its season', async ({ page }) => {
  const search = (ymd: string) =>
    `/search?origin=${encodeURIComponent(ORIGIN)}&destination=${encodeURIComponent(DESTINATION)}&date=${ymd}&passengers=1`;

  // Before: both HIGH-season legs show the season fare.
  await page.goto(search('2097-06-14'));
  await expect(page.locator('body')).toContainText('Rp 150.000', { timeout: 15_000 });

  await loginAsAdmin(page);
  await page.goto(`/admin/operations/departures/${overrideLegId}`);
  await page.locator('#basePrice').fill('130000');
  await page.getByRole('button', { name: 'Update price' }).click();
  await expect(page.locator('body')).toContainText('Saved.', { timeout: 15_000 });

  const leg = await prisma.leg.findUniqueOrThrow({ where: { id: overrideLegId } });
  expect(Number(leg.basePrice)).toBe(130_000);
  expect(leg.priceOverridden).toBe(true);

  await page.goto(search('2097-06-14'));
  await expect(page.locator('body')).toContainText('Rp 130.000', { timeout: 15_000 });
  await expect(page.locator('body')).not.toContainText('Rp 150.000');

  // The neighbouring, untouched leg still follows the season.
  const other = await prisma.leg.findUniqueOrThrow({ where: { id: seasonLegId } });
  expect(other.priceOverridden).toBe(false);
  await page.goto(search('2097-06-12'));
  await expect(page.locator('body')).toContainText('Rp 150.000', { timeout: 15_000 });
});
