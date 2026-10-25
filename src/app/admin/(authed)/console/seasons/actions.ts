'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSuperAdmin } from '@/shared/server/auth';
import { prisma } from '@/shared/server/db';
import { audit } from '@/shared/server/audit';

const SEASONS = '/admin/console/seasons';
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

const seasonSchema = z
  .object({
    type: z.enum(['LOW', 'HIGH', 'PEAK', 'OFF']),
    startDate: ymd,
    endDate: ymd,
    note: z.string().max(100).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'End date cannot be before start date',
    path: ['endDate'],
  });

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

export async function createSeason(formData: FormData) {
  const session = await requireSuperAdmin();
  const parsed = seasonSchema.safeParse({
    type: formData.get('type'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    note: String(formData.get('note') ?? '').trim() || undefined,
  });
  if (!parsed.success) {
    redirect(`${SEASONS}?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }
  const { type, startDate, endDate, note } = parsed.data;
  const created = await prisma.season.create({
    data: { type, startDate: toDate(startDate), endDate: toDate(endDate), note: note ?? null },
  });
  await audit({
    entityType: 'SEASON',
    entityId: created.id,
    action: 'created',
    userId: session.sub,
    userRole: 'ADMIN',
    newState: { type, startDate, endDate },
  });
  revalidatePath(SEASONS);
  redirect(SEASONS);
}

export async function toggleSeason(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = String(formData.get('id') ?? '');
  const next = formData.get('next') === '1';
  if (!id) redirect(SEASONS);
  await prisma.season.update({ where: { id }, data: { isActive: next } });
  await audit({
    entityType: 'SEASON',
    entityId: id,
    action: next ? 'activated' : 'deactivated',
    userId: session.sub,
    userRole: 'ADMIN',
  });
  revalidatePath(SEASONS);
  redirect(SEASONS);
}

export async function deleteSeason(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) redirect(SEASONS);
  await prisma.season.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
  await audit({
    entityType: 'SEASON',
    entityId: id,
    action: 'deleted',
    userId: session.sub,
    userRole: 'ADMIN',
  });
  revalidatePath(SEASONS);
  redirect(SEASONS);
}
