/**
 * Pure parts of `seed-one-rupiah.ts`, kept free of Prisma so they can be unit
 * tested: the schedule definition and the target-confirmation guard.
 */

const COMMON = {
  boatRegistration: 'QA-BOAT-001',
  durationMinutes: 240,
  basePrice: 1,
  daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
} as const;

/**
 * Outbound and return, so a round trip can be tested too: one adult pays
 * Rp 1 + Rp 1 = Rp 2. The return time differs from the real Wahana ones
 * (11:15, 15:45) and the boat is the QA boat, so nothing collides.
 */
export const ONE_RUPIAH_SCHEDULES = [
  { ...COMMON, originPort: 'Padang Bai', destinationPort: 'Senggigi', departureTime: '07:00' },
  { ...COMMON, originPort: 'Senggigi', destinationPort: 'Padang Bai', departureTime: '12:00' },
] as const;

/**
 * The Supabase project ref of a Postgres URL: the `postgres.<ref>` user on the
 * pooler, or `db.<ref>.supabase.co` on the direct host. Null if neither.
 */
export function projectRefFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const user = url.match(/\/\/postgres\.([a-z0-9]+)[:@]/i)?.[1];
  if (user) return user;
  return url.match(/@db\.([a-z0-9]+)\.supabase\.co/i)?.[1] ?? null;
}

/**
 * The script writes to whatever `DATABASE_URL` points at, so it refuses to run
 * unless the operator typed the project ref they mean to write to.
 */
export function assertConfirmedTarget(url: string | undefined, confirm: string | undefined): string {
  const ref = projectRefFromUrl(url);
  if (!ref) throw new Error('Cannot read a Supabase project ref from DATABASE_URL; refusing to write.');
  if (confirm !== ref) {
    throw new Error(
      `Target is Supabase project "${ref}". Re-run with CONFIRM_PROJECT_REF=${ref} to write to it.`,
    );
  }
  return ref;
}
