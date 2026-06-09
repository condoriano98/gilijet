import { prisma } from "./db";
import type { AuditEntityType, AuditUserRole } from "@prisma/client";

/**
 * Append an audit log entry. Never throws — auditing must not break the
 * primary write path. Pass a Prisma transaction client via `tx` when you want
 * the audit row to share a transaction with the entity write.
 */
export async function audit(args: {
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  userId?: string | null;
  userRole?: AuditUserRole | null;
  previousState?: unknown;
  newState?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  tx?: Pick<typeof prisma, "auditLog">;
}): Promise<void> {
  const client = args.tx ?? prisma;
  try {
    await client.auditLog.create({
      data: {
        entityType: args.entityType,
        entityId: args.entityId,
        action: args.action,
        userId: args.userId ?? null,
        userRole: args.userRole ?? null,
        previousState: (args.previousState ?? undefined) as never,
        newState: (args.newState ?? undefined) as never,
        ipAddress: args.ipAddress ?? null,
        userAgent: args.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write log:", err);
  }
}
