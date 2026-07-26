import { prisma } from "../db";

/**
 * A read-only view of the Prisma client for the review MCP.
 *
 * The reviewer reaches this through the app, which holds the normal read-write
 * production credential — so nothing at the database level stops a write. This
 * extension is the control: every operation is checked against an allowlist and
 * anything that mutates throws before Prisma is called.
 *
 * Enforcing it here rather than relying on a restricted Postgres role is
 * deliberate. It travels with the code, it is unit-testable without a database,
 * and it keeps holding if the grants on the database are ever loosened. The
 * two are complementary; this is the one we control.
 *
 * Wrapping the singleton from lib/db.ts rather than constructing a second
 * PrismaClient keeps a single connection pool, which matters on serverless.
 *
 * Two limitations worth knowing:
 *
 * 1. `$allModels` intercepts model operations only, so `$queryRaw` and
 *    `$executeRaw` pass straight through. Nothing in lib/mcp uses them and
 *    tests/unit/mcp-readonly.test.ts fails if that changes, but the guard
 *    itself does not cover them.
 * 2. The result is structurally a different type from `prisma`, so it is not
 *    assignable to `Prisma.TransactionClient`. Helpers taking a client
 *    parameter cannot be handed this — write narrow queries against it instead.
 */

/** Operations that only read. Everything else is refused. */
const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

export class ReadOnlyViolationError extends Error {
  constructor(operation: string, model?: string) {
    super(
      `Read-only MCP client refused "${operation}"${model ? ` on ${model}` : ""}. ` +
        `Allowed: ${[...READ_OPERATIONS].join(", ")}.`,
    );
    this.name = "ReadOnlyViolationError";
  }
}

/** True when Prisma would mutate. Exported so the guard is directly testable. */
export function isReadOperation(operation: string): boolean {
  return READ_OPERATIONS.has(operation);
}

export const readonlyPrisma = prisma.$extends({
  name: "mcp-readonly",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!isReadOperation(operation)) {
          throw new ReadOnlyViolationError(operation, model);
        }
        return query(args);
      },
    },
  },
});

export type ReadOnlyPrisma = typeof readonlyPrisma;
