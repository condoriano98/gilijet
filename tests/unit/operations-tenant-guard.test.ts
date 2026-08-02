import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The operations desk performs the only admin writes to operator-owned
 * inventory in the codebase. Everywhere else tenant scoping is implicit —
 * operator pages read `operatorId` from the session and physically cannot reach
 * another tenant's rows. Admin has no session operator, so the check has to be
 * explicit, and `Schedule` carries no `operatorId` of its own: ownership is
 * derived only through `boatId -> Boat.operatorId`.
 *
 * Attaching a schedule to the wrong tenant's boat would move its bookings,
 * revenue and payouts silently, with nothing downstream to flag it.
 *
 * These are structural checks on the source, not behavioural ones — the actions
 * need a database, and this repo's unit tests deliberately avoid mocking
 * Prisma. They catch the guard being deleted or weakened, which is the failure
 * that matters; they cannot prove it returns the right row. The behavioural
 * check is step 2 of the plan's manual verification.
 */

const source = readFileSync(
  path.join(process.cwd(), "app", "admin", "(authed)", "operations", "actions.ts"),
  "utf8",
);

/**
 * Body of one top-level action, bounded by its own closing brace.
 *
 * Slicing to the next `export` instead would swallow the module-scope schemas
 * that sit between actions and report their fields as if they belonged to the
 * preceding function.
 */
function actionBody(name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  if (start === -1) return "";
  const end = source.indexOf("\n}", start);
  return source.slice(start, end === -1 ? source.length : end + 2);
}

describe("assertBoatOwnedBy", () => {
  const helper = source.slice(
    source.indexOf("async function assertBoatOwnedBy"),
    source.indexOf("async function scheduleWithOwner"),
  );

  it("constrains on the operator, not just the boat id", () => {
    expect(helper).toContain("operatorId");
    expect(helper).toMatch(/id:\s*boatId/);
  });

  it("uses findFirst with both keys rather than findUnique on the id alone", () => {
    // findUnique({ where: { id } }) would return another tenant's boat.
    expect(helper).toContain("findFirst");
    expect(helper).not.toContain("findUnique");
  });

  it("excludes soft-deleted boats", () => {
    expect(helper).toContain("deletedAt: null");
  });
});

describe("schedule writes are ownership-checked", () => {
  it.each(["createSchedule", "updateSchedule"])(
    "%s calls assertBoatOwnedBy before writing",
    (name) => {
      const body = actionBody(name);
      expect(body.length, `${name} not found`).toBeGreaterThan(0);

      const guardAt = body.indexOf("assertBoatOwnedBy(");
      const writeAt = body.search(/prisma\.schedule\.(create|update)\(/);

      expect(guardAt, `${name} does not call assertBoatOwnedBy`).toBeGreaterThan(-1);
      expect(writeAt, `${name} does not write a schedule`).toBeGreaterThan(-1);
      expect(guardAt, `${name} writes before checking ownership`).toBeLessThan(writeAt);
    },
  );

  it("updateSchedule refuses to move a schedule between operators", () => {
    const body = actionBody("updateSchedule");
    expect(body).toContain("existing.boat.operatorId !== d.operatorId");
  });

  it("createSchedule passes the form's operator to the guard, not the boat's own", () => {
    // Reading operatorId off the boat would make the check tautological.
    expect(actionBody("createSchedule")).toContain(
      "assertBoatOwnedBy(d.boatId, d.operatorId)",
    );
  });
});

describe("boat ownership is immutable", () => {
  it("updateBoat never writes operatorId", () => {
    const body = actionBody("updateBoat");
    const writeStart = body.indexOf("prisma.boat.update");
    expect(writeStart).toBeGreaterThan(-1);
    expect(body.slice(writeStart)).not.toContain("operatorId");
  });
});

describe("every action is gated", () => {
  const exported = [...source.matchAll(/export async function (\w+)\(/g)].map(
    (m) => m[1],
  );

  it("exports the expected actions", () => {
    expect(exported).toEqual(
      expect.arrayContaining([
        "createBoat",
        "updateBoat",
        "createSchedule",
        "updateSchedule",
        "setScheduleStatus",
        "regenerateDepartures",
        "cancelDeparture",
      ]),
    );
  });

  it.each(
    [...source.matchAll(/export async function (\w+)\(/g)].map((m) => [m[1]] as [string]),
  )("%s requires super admin first", (name) => {
    const body = actionBody(name);
    const guardAt = body.indexOf("requireSuperAdmin()");
    expect(guardAt, `${name} has no requireSuperAdmin guard`).toBeGreaterThan(-1);

    // A layout guard does not protect a server action, which is directly
    // reachable, so each one repeats it before touching the database.
    const firstDbCall = body.search(/prisma\.|cancelLeg\(|generateLegsForSchedule\(/);
    if (firstDbCall > -1) {
      expect(guardAt, `${name} touches the DB before guarding`).toBeLessThan(firstDbCall);
    }
  });
});
