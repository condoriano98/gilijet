import { expect, type Page } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { MS_PER_HOUR } from '../../../src/shared/constants/time';
import { removeBookings, removeSchedules } from './fixtures';

/** Plain password every fixture customer gets (the specs log in with it). */
export const TEST_PASSWORD = 'e2e-Passw0rd!';

/**
 * Create a customer row directly. Cost 4 keeps bcrypt fast; `verifyPassword`
 * (`bcrypt.compare`) reads the cost from the hash, so the app accepts it.
 * `google: true` makes a Google-only account: no password hash, a Google id.
 */
export async function createCustomer(
  prisma: PrismaClient,
  opts: {
    email: string;
    fullName?: string;
    password?: string;
    google?: boolean;
    phoneNumber?: string | null;
    nationality?: string | null;
  },
) {
  const { email, google = false } = opts;
  return prisma.customer.create({
    data: {
      email: email.toLowerCase(),
      fullName: opts.fullName ?? 'E2E Customer',
      passwordHash: google ? null : await bcrypt.hash(opts.password ?? TEST_PASSWORD, 4),
      googleId: google ? `e2e-google-${email.toLowerCase()}` : null,
      phoneNumber: opts.phoneNumber ?? null,
      nationality: opts.nationality ?? null,
    },
  });
}

/**
 * Remove customers (by email) and everything that points at them: their
 * bookings, failed-login rows and password-reset tokens. Safe to call when
 * nothing exists, so specs call it in both beforeAll and afterAll.
 */
export async function removeCustomers(prisma: PrismaClient, emails: string[]) {
  const lower = emails.map((e) => e.toLowerCase());
  const customers = await prisma.customer.findMany({
    where: { email: { in: lower } },
    select: { id: true },
  });
  const ids = customers.map((c) => c.id);
  // Reviews restrict deleting their booking, so they go first.
  if (ids.length > 0) await prisma.review.deleteMany({ where: { customerId: { in: ids } } });
  await removeBookings(prisma, { customerEmail: { in: lower } });
  if (ids.length > 0) await removeBookings(prisma, { customerId: { in: ids } });
  await prisma.loginAttempt.deleteMany({ where: { emailKey: { in: lower } } });
  await prisma.passwordResetToken.deleteMany({ where: { email: { in: lower } } });
  await prisma.customer.deleteMany({ where: { email: { in: lower } } });
}

/** Raw reset token to row: the app stores only the sha256 of the token. */
export async function createResetToken(
  prisma: PrismaClient,
  opts: { email: string; rawToken: string; expiresAt?: Date; usedAt?: Date | null },
) {
  return prisma.passwordResetToken.create({
    data: {
      email: opts.email.toLowerCase(),
      tokenHash: createHash('sha256').update(opts.rawToken).digest('hex'),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + MS_PER_HOUR),
      usedAt: opts.usedAt ?? null,
    },
  });
}

/**
 * A one-schedule route with one leg per date (UTC 01:00 = 09:00 WITA), on the
 * QA boat from `pnpm seed:qa`. Remove it with `removeTrip` after its bookings.
 */
export async function createTrip(
  prisma: PrismaClient,
  opts: { origin: string; destination: string; dates: string[]; price?: number },
) {
  const price = opts.price ?? 100_000;
  const boat = await prisma.boat.findUniqueOrThrow({ where: { registrationNumber: 'QA-BOAT-001' } });
  const schedule = await prisma.schedule.create({
    data: {
      boatId: boat.id,
      originPort: opts.origin,
      destinationPort: opts.destination,
      departureTime: '09:00',
      durationMinutes: 45,
      basePrice: price,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      status: 'ACTIVE',
    },
  });
  const legs = [];
  for (const ymd of opts.dates) {
    legs.push(
      await prisma.leg.create({
        data: {
          scheduleId: schedule.id,
          operatorId: boat.operatorId,
          departureDate: new Date(`${ymd}T01:00:00Z`),
          basePrice: price,
          status: 'OPEN',
        },
      }),
    );
  }
  return { boat, schedule, legs };
}

export async function removeTrip(prisma: PrismaClient, origins: string[]) {
  await removeSchedules(prisma, origins);
}

/** A paid, confirmed one-way booking on `legId`, optionally linked to a customer. */
export async function createConfirmedBooking(
  prisma: PrismaClient,
  opts: {
    reference: string;
    legId: string;
    operatorId: string;
    email: string;
    customerId?: string;
    amount?: number;
  },
) {
  const amount = opts.amount ?? 100_000;
  return prisma.booking.create({
    data: {
      bookingReference: opts.reference,
      legId: opts.legId,
      operatorId: opts.operatorId,
      customerId: opts.customerId ?? null,
      customerName: 'E2E Customer',
      customerEmail: opts.email.toLowerCase(),
      customerPhone: '+620000000000',
      status: 'CONFIRMED',
      refundDeadline: new Date('2090-06-05T00:00:00Z'),
      totalAmount: amount,
      commissionAmount: amount * 0.08,
      operatorAmount: amount * 0.92,
      notes: JSON.stringify({ passengers: [{ name: 'E2E Passenger', idNumber: null, type: 'ADULT' }] }),
      payment: { create: { amount, method: 'BANK_TRANSFER', status: 'SUCCESSFUL' } },
    },
  });
}

/** Log in through the real form and wait until the account page is showing. */
export async function loginViaUi(page: Page, email: string, password = TEST_PASSWORD) {
  await page.goto('/account/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/account(\?|$)/, { timeout: 20_000 });
}
