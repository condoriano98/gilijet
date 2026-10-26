import type { AdSyncStatus, Prisma } from '@prisma/client';
import { prisma } from '@/shared/server/db';
import { eachDay, scopeKey, type SpendDelivery, type SpendRecord } from '@/features/marketing/ads/types';
import { validateSpendBatch } from '@/features/marketing/ads/validate';
import { scrubError } from '@/features/marketing/privacy';

/**
 * Replace-by-grain ingestion of daily spend.
 *
 * The unit of replacement is one account-day (platform, account, date). For
 * each scope the delivery covers, the stored rows are deleted and the new
 * rows inserted in the same transaction, so:
 * - re-importing the same data rewrites the same rows (no added spend);
 * - a corrected file or a late platform revision replaces that day exactly;
 * - a failure anywhere rolls the whole write back, leaving prior data.
 *
 * Which scopes a delivery covers:
 * - CSV: exactly the account-days present in the file. A day not in the file
 *   is never touched, so a file cannot erase what it does not mention.
 * - API: every day in the requested range for the account, but only when the
 *   source confirms the response is complete. A day the API returned no rows
 *   for is then a genuinely empty day and is cleared. Two guards stop an
 *   outage looking like a quiet week: an incomplete response writes nothing,
 *   and a complete response with no rows at all for a range that has stored
 *   spend writes nothing either (it is reported, and an admin can confirm the
 *   empty period with a CSV of zero rows).
 */
export type IngestReport = {
  status: AdSyncStatus;
  rowsWritten: number;
  rowsReplaced: number;
  rowsRejected: number;
  scopesWritten: string[];
  scopesCleared: string[];
  scopesRejected: Array<{ scope: string; reasons: string[] }>;
  warnings: string[];
};

type Db = Prisma.TransactionClient;

export async function ingestSpendDelivery(
  delivery: SpendDelivery,
  meta: { syncRunId: string; now?: Date },
  db: { $transaction: (fn: (tx: Db) => Promise<void>) => Promise<void> } = prisma,
): Promise<IngestReport> {
  const report: IngestReport = {
    status: 'FAILED',
    rowsWritten: 0,
    rowsReplaced: 0,
    rowsRejected: 0,
    scopesWritten: [],
    scopesCleared: [],
    scopesRejected: [],
    warnings: [],
  };
  if (!delivery.complete) {
    report.warnings.push(`INCOMPLETE_DELIVERY${delivery.incompleteReason ? `: ${delivery.incompleteReason}` : ''}; prior data kept`);
    return report;
  }

  const { validScopes, rejected } = validateSpendBatch(delivery.records);
  report.scopesRejected = rejected;
  report.rowsRejected = rejected.reduce((n, r) => n + delivery.records.filter((x) => scopeKey(x) === r.scope).length, 0);

  // API deliveries also cover the days they returned nothing for.
  const emptyScopes: string[] = [];
  if (delivery.source === 'API' && delivery.accountId) {
    const rejectedScopes = new Set(rejected.map((r) => r.scope));
    for (const day of eachDay(delivery.dateFrom, delivery.dateTo)) {
      const k = scopeKey({ platform: delivery.platform, accountId: delivery.accountId, date: day });
      if (!validScopes.has(k) && !rejectedScopes.has(k)) emptyScopes.push(k);
    }
  }

  const now = meta.now ?? new Date();
  try {
    await db.$transaction(async (tx) => {
      if (delivery.source === 'API' && delivery.accountId && validScopes.size === 0 && rejected.length === 0) {
        const existing = await tx.adSpendDaily.count({
          where: {
            platform: delivery.platform,
            accountId: delivery.accountId,
            date: { gte: asDate(delivery.dateFrom), lte: asDate(delivery.dateTo) },
          },
        });
        if (existing > 0) {
          report.warnings.push(`EMPTY_RESPONSE_WOULD_ERASE_${existing}_ROWS; prior data kept`);
          emptyScopes.length = 0;
        }
      }

      for (const [scope, rows] of validScopes) {
        const [platform, accountId, date] = scope.split('|');
        const deleted = await tx.adSpendDaily.deleteMany({ where: { platform: platform as SpendRecord['platform'], accountId, date: asDate(date) } });
        await tx.adSpendDaily.createMany({ data: rows.map((r) => toRow(r, delivery.source, meta.syncRunId, now)) });
        report.rowsReplaced += deleted.count;
        report.rowsWritten += rows.length;
        report.scopesWritten.push(scope);
      }
      for (const scope of emptyScopes) {
        const [platform, accountId, date] = scope.split('|');
        const deleted = await tx.adSpendDaily.deleteMany({ where: { platform: platform as SpendRecord['platform'], accountId, date: asDate(date) } });
        report.rowsReplaced += deleted.count;
        report.scopesCleared.push(scope);
      }

      // Reach: replaced per campaign-day it covers, never summed into spend.
      for (const r of delivery.reach) {
        const where = { platform: r.platform, accountId: r.accountId, date: asDate(r.date), campaignId: r.campaignId };
        await tx.adReachDaily.deleteMany({ where });
        await tx.adReachDaily.create({
          data: { ...where, reach: r.reach, frequency: r.frequency, source: delivery.source, syncRunId: meta.syncRunId, syncedAt: now },
        });
      }
    });
  } catch (err) {
    report.status = 'FAILED';
    report.rowsWritten = 0;
    report.rowsReplaced = 0;
    report.scopesWritten = [];
    report.scopesCleared = [];
    report.warnings.push(`WRITE_FAILED: ${scrubError(err, 300)}; prior data kept`);
    return report;
  }

  const wroteSomething = report.scopesWritten.length + report.scopesCleared.length > 0;
  if (rejected.length === 0 && report.warnings.length === 0) report.status = 'SUCCEEDED';
  else if (wroteSomething) report.status = 'PARTIAL';
  // Nothing written: a rejected batch failed; a refused erase kept good data.
  else report.status = rejected.length > 0 ? 'FAILED' : 'PARTIAL';
  return report;
}

function asDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

function toRow(r: SpendRecord, source: SpendDelivery['source'], syncRunId: string, now: Date): Prisma.AdSpendDailyCreateManyInput {
  return {
    platform: r.platform,
    accountId: r.accountId,
    date: asDate(r.date),
    accountTimezone: r.accountTimezone,
    currency: r.currency,
    level: r.level,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    adGroupId: r.adGroupId,
    adId: r.adId,
    breakdownDims: r.breakdownDims,
    breakdownValue: r.breakdownValue,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    platformPurchases: r.platformPurchases,
    platformPurchaseValue: r.platformPurchaseValue,
    attributionSetting: r.attributionSetting,
    reportDateBasis: r.reportDateBasis,
    source,
    syncRunId,
    syncedAt: now,
  };
}

/**
 * Run one delivery end to end with its AdSyncRun audit row: RUNNING first,
 * then the outcome, counts and per-scope report.
 */
export async function runSpendIngestion(
  delivery: SpendDelivery,
  meta: { triggeredBy: string; fileName?: string; contentHash?: string },
): Promise<{ runId: string; report: IngestReport }> {
  const run = await prisma.adSyncRun.create({
    data: {
      platform: delivery.platform,
      source: delivery.source,
      accountId: delivery.accountId,
      dateFrom: asDate(delivery.dateFrom),
      dateTo: asDate(delivery.dateTo),
      status: 'RUNNING',
      fileName: meta.fileName ?? null,
      contentHash: meta.contentHash ?? null,
      triggeredBy: meta.triggeredBy,
      unavailableFields: delivery.unavailableFields,
    },
  });
  const report = await ingestSpendDelivery(delivery, { syncRunId: run.id });
  await prisma.adSyncRun.update({
    where: { id: run.id },
    data: {
      status: report.status,
      rowsWritten: report.rowsWritten,
      rowsReplaced: report.rowsReplaced,
      rowsRejected: report.rowsRejected,
      errorMessage: report.warnings.length ? report.warnings.join('; ').slice(0, 1000) : null,
      report: {
        scopesWritten: report.scopesWritten,
        scopesCleared: report.scopesCleared,
        scopesRejected: report.scopesRejected,
        warnings: report.warnings,
      },
      finishedAt: new Date(),
    },
  });
  return { runId: run.id, report };
}
