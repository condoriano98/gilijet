import { NextResponse } from 'next/server';
import { getAdminSession, type AdminSession } from '@/shared/server/auth';

/**
 * Route-handler guard for marketing and finance APIs: SUPER_ADMIN only, the
 * same rule as requireSuperAdmin() on pages. Route handlers cannot redirect a
 * fetch, so they answer 401 (no session) or 403 (staff admin) instead.
 */
export async function superAdminOrResponse(): Promise<AdminSession | NextResponse> {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (session.adminRole !== 'SUPER_ADMIN') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  return session;
}
