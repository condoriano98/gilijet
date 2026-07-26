import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  FEATURES,
  featureById,
  featuresByArea,
  statusCounts,
  type Feature,
} from "@/lib/feature-catalog";

/**
 * Drift guard for the feature catalog.
 *
 * The catalog is hand-maintained because status cannot be derived from the
 * filesystem, but the paths in it can rot silently as the codebase moves. These
 * tests fail when a referenced route, module or model disappears, so the answer
 * a reviewer gets stays tied to the code rather than to whenever it was last
 * written by hand.
 *
 * What this cannot check is whether a "shipped" label is true — that is a
 * judgement. It only guarantees the things a label points at still exist.
 */

const root = process.cwd();
const schema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");

describe("catalog integrity", () => {
  it("is not empty", () => {
    expect(FEATURES.length).toBeGreaterThan(0);
  });

  it("has unique ids", () => {
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses lowercase kebab-case ids so they are stable to type", () => {
    for (const f of FEATURES) {
      expect(f.id, `${f.id} is not kebab-case`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("gives every feature a name", () => {
    for (const f of FEATURES) {
      expect(f.name.trim().length, `${f.id} has no name`).toBeGreaterThan(0);
    }
  });

  it("is reachable through the lookup helpers", () => {
    for (const f of FEATURES) {
      expect(featureById(f.id)?.id).toBe(f.id);
    }
    expect(featureById("no-such-feature")).toBeUndefined();
  });

  it("partitions cleanly by area", () => {
    const areas = ["customer", "operator", "admin", "api", "platform"] as const;
    const summed = areas.reduce((n, a) => n + featuresByArea(a).length, 0);
    expect(summed).toBe(FEATURES.length);
  });

  it("counts every feature exactly once by status", () => {
    const counts = statusCounts();
    const summed = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(summed).toBe(FEATURES.length);
  });
});

describe("referenced paths exist", () => {
  const withRoutes = FEATURES.filter((f) => f.routes.length > 0);

  it.each(withRoutes.map((f) => [f.id, f] as [string, Feature]))(
    "%s: every route exists",
    (_id, f) => {
      for (const route of f.routes) {
        expect(existsSync(path.join(root, route)), `${f.id}: missing ${route}`).toBe(true);
      }
    },
  );

  const withModules = FEATURES.filter((f) => f.modules.length > 0);

  it.each(withModules.map((f) => [f.id, f] as [string, Feature]))(
    "%s: every module exists",
    (_id, f) => {
      for (const mod of f.modules) {
        expect(existsSync(path.join(root, mod)), `${f.id}: missing ${mod}`).toBe(true);
      }
    },
  );
});

describe("referenced Prisma models exist", () => {
  const withModels = FEATURES.filter((f) => f.models.length > 0);

  it.each(withModels.map((f) => [f.id, f] as [string, Feature]))(
    "%s: every model is declared in schema.prisma",
    (_id, f) => {
      for (const model of f.models) {
        const declared = new RegExp(`^model\\s+${model}\\s*\\{`, "m").test(schema);
        expect(declared, `${f.id}: ${model} is not a model in schema.prisma`).toBe(true);
      }
    },
  );
});

describe("statuses carry the context that makes them useful", () => {
  it("explains every non-shipped status in notes", () => {
    for (const f of FEATURES) {
      if (f.status === "shipped") continue;
      expect(
        f.notes && f.notes.trim().length > 0,
        `${f.id} is "${f.status}" but has no notes explaining why`,
      ).toBe(true);
    }
  });

  it("keeps the placeholders and schema-only entries honest", () => {
    // These are the entries most likely to be quietly upgraded to "shipped"
    // without the work actually landing, so pin them to observable facts.
    const fuel = featureById("operator-fuel");
    expect(fuel?.status).toBe("placeholder");
    expect(fuel?.models).toEqual([]);

    const loyalty = featureById("platform-loyalty");
    expect(loyalty?.status).toBe("schema-only");
    expect(loyalty?.routes).toEqual([]);
  });

  it("does not claim a schema-only feature has routes", () => {
    for (const f of FEATURES.filter((x) => x.status === "schema-only")) {
      expect(f.routes, `${f.id} is schema-only but lists routes`).toEqual([]);
    }
  });

  it("does not claim a placeholder has models backing it", () => {
    for (const f of FEATURES.filter((x) => x.status === "placeholder")) {
      expect(f.models, `${f.id} is a placeholder but lists models`).toEqual([]);
    }
  });
});
