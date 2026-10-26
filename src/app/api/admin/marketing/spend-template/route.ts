import { NextResponse } from 'next/server';
import { superAdminOrResponse } from '@/features/marketing/admin-api';
import { CSV_COLUMNS, csvTemplate } from '@/features/marketing/ads/csv';

/** GET the spend CSV header (?format=schema for the column notes as JSON). SUPER_ADMIN. */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await superAdminOrResponse();
  if (auth instanceof NextResponse) return auth;
  if (new URL(req.url).searchParams.get('format') === 'schema') return NextResponse.json({ columns: CSV_COLUMNS });
  return new NextResponse(csvTemplate(), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="gilifast-ad-spend-template.csv"' },
  });
}
