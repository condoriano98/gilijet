/**
 * Unit test: refund-policy snapshot invariance.
 *
 * Verifies that once a snapshot is captured at booking time, refund
 * calculations always use the snapshot's tiers rather than any later
 * changes to the live tier table.
 *
 * Run:  npx tsx tests/refund-snapshot.test.ts
 */
import { refundAmountForCustomer, snapshotCurrentPolicy } from "../lib/refunds";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
}

function testSnapshotInsulatesFromLiveTierChanges() {
  const now = new Date("2026-06-10T00:00:00Z");
  const departure = new Date("2026-06-18T00:00:00Z"); // 192 hours away (>168h → FULL)
  const deadline = new Date("2026-06-16T00:00:00Z"); // 48 hours before
  const paidAmount = "100000"; // 100,000 IDR

  // 1. Capture a snapshot with the current policy (current live tiers at booking time).
  const snapshot = snapshotCurrentPolicy({ departure, deadline });

  assert(snapshot.version === "2026-01", "snapshot has version");
  assert(snapshot.tiers.length === 3, "snapshot has 3 tiers");

  // 2. Compute refund using the snapshot: 192h before departure → FULL tier (>168h threshold).
  const withSnapshot = refundAmountForCustomer({
    now,
    departure,
    paidAmount,
    snapshot,
  });

  assert(withSnapshot.tier === "FULL", "192h before departure → FULL refund with snapshot");
  assert(withSnapshot.amount.toString() === "100000", "100% refund = 100,000");

  // 3. Now simulate a policy change: mutate the snapshot to a hypothetical new
  //    tier table (e.g. ALL refunds → 0%).
  const mutatedSnapshot = {
    ...snapshot,
    version: "2027-06",
    tiers: [
      { hoursBeforeDeparture: 24, refundFraction: 0 },
      { hoursBeforeDeparture: 0, refundFraction: 0 },
    ],
  };

  // The refund MUST still compute against the original snapshot, not the mutated one.
  const withOriginal = refundAmountForCustomer({
    now,
    departure,
    paidAmount,
    snapshot,
  });

  assert(
    withOriginal.amount.toString() === "100000",
    "uses original snapshot tiers, not mutated ones",
  );

  // 4. Computing with the mutated snapshot yields a different result.
  const withMutated = refundAmountForCustomer({
    now,
    departure,
    paidAmount,
    snapshot: mutatedSnapshot,
  });

  assert(
    withMutated.amount.toString() === "0",
    `mutated snapshot gives 0 refund (got ${withMutated.amount.toString()})`,
  );

  // 5. Without any snapshot, computation still falls back to live (hardcoded) tiers.
  const withoutSnapshot = refundAmountForCustomer({
    now,
    departure,
    paidAmount,
  });

  assert(
    withoutSnapshot.tier === "FULL",
    "192h before → FULL with live tiers (>168h)",
  );
  assert(
    withoutSnapshot.amount.toString() === "100000",
    "100% refund = 100,000",
  );

  console.log("PASS: refund-snapshot.test.ts");
}

testSnapshotInsulatesFromLiveTierChanges();
