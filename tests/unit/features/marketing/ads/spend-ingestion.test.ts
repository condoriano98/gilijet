import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/shared/server/db', () => ({ prisma: {} }));
vi.mock('@/shared/server/env', () => ({ env: {} }));

import { parseSpendCsv, parseCsv, csvTemplate } from '@/features/marketing/ads/csv';
import { ingestSpendDelivery } from '@/features/marketing/ads/ingest';
import { validateSpendBatch } from '@/features/marketing/ads/validate';
import type { SpendDelivery, SpendRecord } from '@/features/marketing/ads/types';

type Row = Record<string, unknown> & { platform: string; accountId: string; date: Date; spend: Prisma.Decimal };

/** In-memory store with real transaction semantics: all or nothing. */
function memoryDb(seed: Row[] = [], opts: { failOnCreate?: boolean } = {}) {
  let spend: Row[] = [...seed];
  let reach: Row[] = [];
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const val = r[k];
      if (v && typeof v === 'object' && !(v instanceof Date) && ('gte' in v || 'lte' in v)) {
        const o = v as { gte?: Date; lte?: Date };
        const t = (val as Date).getTime();
        return (!o.gte || t >= o.gte.getTime()) && (!o.lte || t <= o.lte.getTime());
      }
      return val instanceof Date && v instanceof Date ? val.getTime() === v.getTime() : val === v;
    });
  const db = {
    get rows() {
      return spend;
    },
    total() {
      return spend.reduce((acc, r) => acc.add(r.spend), new Prisma.Decimal(0)).toString();
    },
    async $transaction(fn: (tx: unknown) => Promise<void>) {
      const s = [...spend];
      const rc = [...reach];
      const tx = {
        adSpendDaily: {
          count: async ({ where }: { where: Record<string, unknown> }) => s.filter((r) => matches(r, where)).length,
          deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
            const before = s.length;
            for (let i = s.length - 1; i >= 0; i--) if (matches(s[i], where)) s.splice(i, 1);
            return { count: before - s.length };
          },
          createMany: async ({ data }: { data: Row[] }) => {
            if (opts.failOnCreate) throw new Error('connection lost');
            s.push(...data);
            return { count: data.length };
          },
        },
        adReachDaily: {
          deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
            for (let i = rc.length - 1; i >= 0; i--) if (matches(rc[i], where)) rc.splice(i, 1);
            return { count: 0 };
          },
          create: async ({ data }: { data: Row }) => {
            rc.push(data);
            return data;
          },
        },
      };
      await fn(tx);
      spend = s;
      reach = rc;
    },
    get reach() {
      return reach;
    },
  };
  return db;
}

const HEADER = 'platform,account_id,date,account_timezone,currency,campaign_id,campaign_name,ad_group_or_adset_id,ad_id,spend,impressions,clicks';
const csv = (...lines: string[]) => [HEADER, ...lines].join('\n');

function record(over: Partial<SpendRecord> = {}): SpendRecord {
  return {
    platform: 'META_ADS',
    accountId: '111',
    date: '2026-10-20',
    accountTimezone: 'Asia/Makassar',
    currency: 'IDR',
    level: 'AD',
    campaignId: 'c1',
    campaignName: 'Gili',
    adGroupId: 's1',
    adId: 'a1',
    breakdownDims: '',
    breakdownValue: '',
    spend: new Prisma.Decimal('100000'),
    impressions: 1000,
    clicks: 30,
    platformPurchases: null,
    platformPurchaseValue: null,
    attributionSetting: null,
    reportDateBasis: null,
    ...over,
  };
}

const api = (over: Partial<SpendDelivery> = {}): SpendDelivery => ({
  platform: 'META_ADS',
  source: 'API',
  accountId: '111',
  dateFrom: '2026-10-20',
  dateTo: '2026-10-21',
  complete: true,
  records: [],
  reach: [],
  unavailableFields: [],
  ...over,
});

const ingest = (db: ReturnType<typeof memoryDb>, d: SpendDelivery) => ingestSpendDelivery(d, { syncRunId: 'run' }, db as never);

describe('CSV parsing and validation', () => {
  it('parses quoted fields and infers the level from the ids', () => {
    expect(parseCsv('a,"b, c","d ""q"""\n1,2,3')).toEqual([['a', 'b, c', 'd "q"'], ['1', '2', '3']]);
    const r = parseSpendCsv(csv('meta_ads,act_111,2026-10-20,Asia/Makassar,IDR,c1,"Gili, Bali",s1,a1,125000.50,1000,30'));
    expect(r.headerErrors).toEqual([]);
    expect(r.deliveries[0].records[0]).toMatchObject({ accountId: '111', level: 'AD', campaignName: 'Gili, Bali' });
    expect(r.deliveries[0].records[0].spend.toString()).toBe('125000.5');
    expect(csvTemplate().split(',')[0]).toBe('platform');
  });

  it('refuses the whole file when any row is invalid, naming the line', () => {
    const r = parseSpendCsv(csv('meta_ads,111,2026-10-20,Asia/Makassar,IDR,c1,,,,100,1,1', 'meta_ads,111,2026-13-01,Mars/Base,ID,c1,,,,-x,1.5,1'));
    expect(r.deliveries).toEqual([]);
    expect(r.rowErrors).toEqual([{ line: 3, errors: expect.arrayContaining(['INVALID_DATE', 'INVALID_TIMEZONE', 'INVALID_CURRENCY', 'INVALID_SPEND', 'INVALID_IMPRESSIONS']) }]);
  });

  it('rejects missing and unknown columns', () => {
    expect(parseSpendCsv('platform,spend,foo\nmeta_ads,1,2').headerErrors).toEqual(expect.arrayContaining(['MISSING_COLUMN_account_id', 'UNKNOWN_COLUMN_foo']));
  });

  it('identical files have identical content hashes', () => {
    const t = csv('meta_ads,111,2026-10-20,Asia/Makassar,IDR,c1,,,,100,1,1');
    expect(parseSpendCsv(t).contentHash).toBe(parseSpendCsv(t).contentHash);
  });

  it('rejects mixed reporting grain and mixed currency per scope', () => {
    const v = validateSpendBatch([
      record(),
      record({ level: 'CAMPAIGN', adGroupId: '', adId: '', spend: new Prisma.Decimal('100000') }),
      record({ accountId: '222', date: '2026-10-20', currency: 'IDR' }),
      record({ accountId: '222', date: '2026-10-21', currency: 'USD' }),
    ]);
    const reasons = Object.fromEntries(v.rejected.map((r) => [r.scope, r.reasons]));
    expect(reasons['META_ADS|111|2026-10-20']).toContain('MIXED_REPORTING_LEVELS');
    expect(reasons['META_ADS|222|2026-10-20']).toContain('MIXED_CURRENCIES_FOR_ACCOUNT');
    expect(v.validScopes.size).toBe(0);
  });

  it('rejects duplicate rows and campaign rows carrying child ids', () => {
    const v = validateSpendBatch([record(), record(), record({ date: '2026-10-21', level: 'CAMPAIGN' })]);
    expect(v.rejected.flatMap((r) => r.reasons)).toEqual(expect.arrayContaining(['DUPLICATE_ROW', 'CAMPAIGN_LEVEL_WITH_CHILD_IDS']));
  });
});

describe('replace-by-grain ingestion', () => {
  const file = csv('meta_ads,111,2026-10-20,Asia/Makassar,IDR,c1,,s1,a1,100000,1000,30', 'meta_ads,111,2026-10-20,Asia/Makassar,IDR,c1,,s1,a2,50000,500,10');

  it('re-importing the identical CSV does not add spend', async () => {
    const db = memoryDb();
    const d = parseSpendCsv(file).deliveries[0];
    expect((await ingest(db, d)).status).toBe('SUCCEEDED');
    expect(db.total()).toBe('150000');
    const again = await ingest(db, parseSpendCsv(file).deliveries[0]);
    expect(again).toMatchObject({ status: 'SUCCEEDED', rowsReplaced: 2, rowsWritten: 2 });
    expect(db.total()).toBe('150000');
    expect(db.rows).toHaveLength(2);
  });

  it('a corrected CSV replaces exactly the account-days it contains', async () => {
    const db = memoryDb();
    await ingest(db, parseSpendCsv(csv('meta_ads,111,2026-10-20,Asia/Makassar,IDR,c1,,s1,a1,100000,1,1', 'meta_ads,111,2026-10-21,Asia/Makassar,IDR,c1,,s1,a1,70000,1,1')).deliveries[0]);
    await ingest(db, parseSpendCsv(csv('meta_ads,111,2026-10-20,Asia/Makassar,IDR,c1,,s1,a1,90000,1,1')).deliveries[0]);
    expect(db.total()).toBe('160000');
  });

  it('a failed write leaves the previous valid rows untouched', async () => {
    const seed = memoryDb();
    await ingest(seed, parseSpendCsv(file).deliveries[0]);
    const db = memoryDb(seed.rows, { failOnCreate: true });
    const r = await ingest(db, parseSpendCsv(csv('meta_ads,111,2026-10-20,Asia/Makassar,IDR,c1,,s1,a1,1,1,1')).deliveries[0]);
    expect(r.status).toBe('FAILED');
    expect(r.warnings[0]).toMatch(/WRITE_FAILED: connection lost; prior data kept/);
    expect(db.total()).toBe('150000');
  });

  it('an incomplete API response writes nothing', async () => {
    const seed = memoryDb();
    await ingest(seed, parseSpendCsv(file).deliveries[0]);
    const r = await ingest(seed, api({ complete: false, incompleteReason: 'HTTP 500', records: [record({ spend: new Prisma.Decimal(1) })] }));
    expect(r.status).toBe('FAILED');
    expect(seed.total()).toBe('150000');
  });

  it('a complete but entirely empty API response does not erase stored spend', async () => {
    const db = memoryDb();
    await ingest(db, parseSpendCsv(file).deliveries[0]);
    const r = await ingest(db, api());
    expect(r.status).toBe('PARTIAL');
    expect(r.warnings[0]).toMatch(/EMPTY_RESPONSE_WOULD_ERASE_2_ROWS/);
    expect(db.total()).toBe('150000');
  });

  it('a complete API response clears only the genuinely empty days', async () => {
    const db = memoryDb();
    await ingest(db, parseSpendCsv(csv('meta_ads,111,2026-10-20,Asia/Makassar,IDR,c1,,s1,a1,100,1,1', 'meta_ads,111,2026-10-21,Asia/Makassar,IDR,c1,,s1,a1,200,1,1')).deliveries[0]);
    const r = await ingest(db, api({ records: [record({ date: '2026-10-20', spend: new Prisma.Decimal(120) })] }));
    expect(r).toMatchObject({ status: 'SUCCEEDED', scopesCleared: ['META_ADS|111|2026-10-21'] });
    expect(db.total()).toBe('120');
  });

  it('a revised API day replaces the old figure (late platform revisions)', async () => {
    const db = memoryDb();
    await ingest(db, api({ dateTo: '2026-10-20', records: [record({ spend: new Prisma.Decimal(100) })] }));
    await ingest(db, api({ dateTo: '2026-10-20', records: [record({ spend: new Prisma.Decimal(105) })] }));
    expect(db.total()).toBe('105');
  });

  it('writes valid scopes and reports rejected ones (partial success)', async () => {
    const db = memoryDb();
    const r = await ingest(db, api({ records: [record(), record({ date: '2026-10-21' }), record({ date: '2026-10-21' })] }));
    expect(r.status).toBe('PARTIAL');
    expect(r.scopesWritten).toEqual(['META_ADS|111|2026-10-20']);
    expect(r.scopesRejected[0]).toMatchObject({ scope: 'META_ADS|111|2026-10-21', reasons: ['DUPLICATE_ROW'] });
    expect(db.total()).toBe('100000');
  });

  it('stores reach separately from spend', async () => {
    const db = memoryDb();
    await ingest(db, api({ records: [record()], reach: [{ platform: 'META_ADS', accountId: '111', date: '2026-10-20', campaignId: 'c1', reach: 800, frequency: new Prisma.Decimal('1.25') }] }));
    expect(db.reach).toHaveLength(1);
    expect(db.rows[0]).not.toHaveProperty('reach');
  });
});
