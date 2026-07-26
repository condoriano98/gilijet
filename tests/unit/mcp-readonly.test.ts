import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { isReadOperation, ReadOnlyViolationError } from "@/lib/mcp/readonly-client";

/**
 * The review MCP must not be able to change anything. Two independent checks:
 * the runtime guard refuses mutating operations, and nothing under lib/mcp
 * imports a module that writes.
 *
 * The guard is testable without a database because it throws before Prisma is
 * reached, which keeps this in line with the rest of tests/unit — pure
 * functions, no mocking.
 */

describe("isReadOperation", () => {
  const reads = [
    "findUnique",
    "findUniqueOrThrow",
    "findFirst",
    "findFirstOrThrow",
    "findMany",
    "count",
    "aggregate",
    "groupBy",
  ];

  const writes = [
    "create",
    "createMany",
    "createManyAndReturn",
    "update",
    "updateMany",
    "upsert",
    "delete",
    "deleteMany",
  ];

  it.each(reads)("allows %s", (op) => {
    expect(isReadOperation(op)).toBe(true);
  });

  it.each(writes)("refuses %s", (op) => {
    expect(isReadOperation(op)).toBe(false);
  });

  it("refuses anything it does not recognise, rather than defaulting to allow", () => {
    expect(isReadOperation("someFutureMutation")).toBe(false);
    expect(isReadOperation("")).toBe(false);
  });
});

describe("ReadOnlyViolationError", () => {
  it("names the refused operation and model so the cause is obvious", () => {
    const err = new ReadOnlyViolationError("update", "Booking");
    expect(err.message).toContain("update");
    expect(err.message).toContain("Booking");
    expect(err.name).toBe("ReadOnlyViolationError");
  });
});

describe("lib/mcp does not reach write paths", () => {
  const mcpDir = path.join(process.cwd(), "lib", "mcp");

  function sources(): { file: string; text: string }[] {
    return readdirSync(mcpDir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => ({ file: f, text: readFileSync(path.join(mcpDir, f), "utf8") }));
  }

  it("has sources to check", () => {
    expect(sources().length).toBeGreaterThan(0);
  });

  // Modules whose whole job is to mutate. Importing any of them from the
  // read-only surface is a bug even if the call looks harmless.
  const FORBIDDEN_MODULES = [
    "booking-engine",
    "ticket-issuer",
    "booking-expiry",
    "seed-data",
    "audit",
    "email",
    "legs",
    "refund-gateway",
    "webhook-processor",
  ];

  it.each(FORBIDDEN_MODULES)("does not import %s", (mod) => {
    for (const { file, text } of sources()) {
      const importRe = new RegExp(`(from|import)\\s*\\(?\\s*["'][^"']*${mod}["']`);
      expect(importRe.test(text), `${file} imports ${mod}`).toBe(false);
    }
  });

  it("does not call getPlatformConfig, which is an upsert despite the name", () => {
    for (const { file, text } of sources()) {
      expect(text.includes("getPlatformConfig"), `${file} calls getPlatformConfig`).toBe(
        false,
      );
    }
  });

  it("does not use raw queries, which the model-level guard cannot intercept", () => {
    for (const { file, text } of sources()) {
      for (const raw of ["queryRaw", "executeRaw", "queryRawUnsafe", "executeRawUnsafe"]) {
        // Match a call on a client (`db.$queryRaw`), not a bare mention — the
        // guard documents these by name in a comment explaining why it cannot
        // intercept them.
        const callRe = new RegExp(`\\.\\$${raw}\\b`);
        expect(callRe.test(text), `${file} calls $${raw}`).toBe(false);
      }
    }
  });

  it("only reaches Prisma through the read-only client", () => {
    for (const { file, text } of sources()) {
      if (file === "readonly-client.ts") continue; // the one place that may
      const importsRawPrisma = /(from|import)\s*\(?\s*["'][^"']*\/db["']/.test(text);
      expect(importsRawPrisma, `${file} imports lib/db directly`).toBe(false);
    }
  });
});
