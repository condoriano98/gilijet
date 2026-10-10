'use server';
import { prisma } from '@/shared/server/db';
import { requireOperator } from '@/shared/server/auth';
import { redirect } from 'next/navigation';

export async function lockPeriod() {
  const session = await requireOperator();
  await prisma.operatorNotification.create({
    data: {
      operatorId: session.sub,
      kind: 'PAYROLL_DRAFT_READY',
      severity: 'INFO',
      title: 'Periode Payroll Siak',
      body: 'Periode payroll telah dikunci untuk bulan ini',
      readAt: new Date(),
    },
  });
  redirect('/operator/penggajian?ok=locked');
}
