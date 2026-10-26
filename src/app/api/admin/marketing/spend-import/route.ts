import { NextRequest, NextResponse } from 'next/server';
import { superAdminOrResponse } from '@/features/marketing/admin-api';
import { parseSpendCsv } from '@/features/marketing/ads/csv';
import { runSpendIngestion } from '@/features/marketing/ads/ingest';

/**
 * POST a spend CSV (multipart field "file", or text/csv body). SUPER_ADMIN.
 * A file with any invalid row is refused whole and nothing is written; the
 * response lists the lines to fix. Valid files replace the account-days they
 * contain (see src/features/marketing/ads/ingest.ts).
 */
export const dynamic = 'force-dynamic';
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await superAdminOrResponse();
  if (auth instanceof NextResponse) return auth;
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'File too large (max 5 MB)' }, { status: 413 });
  }
  let text: string;
  let fileName = 'upload.csv';
  const type = req.headers.get('content-type') ?? '';
  if (type.startsWith('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Missing file field' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'File too large (max 5 MB)' }, { status: 413 });
    fileName = file.name.slice(0, 200);
    text = await file.text();
  } else {
    text = await req.text();
    if (text.length > MAX_BYTES) return NextResponse.json({ ok: false, error: 'File too large (max 5 MB)' }, { status: 413 });
  }

  const parsed = parseSpendCsv(text);
  if (parsed.headerErrors.length || parsed.rowErrors.length) {
    return NextResponse.json(
      { ok: false, written: false, headerErrors: parsed.headerErrors, rowErrors: parsed.rowErrors.slice(0, 200), rowCount: parsed.rowCount },
      { status: 422 },
    );
  }
  const runs = [];
  for (const delivery of parsed.deliveries) {
    const { runId, report } = await runSpendIngestion(delivery, { triggeredBy: `admin:${auth.sub}`, fileName, contentHash: parsed.contentHash });
    runs.push({ runId, platform: delivery.platform, ...report });
  }
  return NextResponse.json({ ok: true, contentHash: parsed.contentHash, rowCount: parsed.rowCount, runs });
}
