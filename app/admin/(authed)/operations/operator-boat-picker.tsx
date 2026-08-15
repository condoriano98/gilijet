"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export type PickerBoat = {
  id: string;
  name: string;
  operatorId: string;
};

export type PickerOperator = { id: string; companyName: string };

/**
 * Operator, then boat — with the boat list narrowed to the chosen operator.
 *
 * The narrowing is a usability aid, not the safeguard: `createSchedule` re-runs
 * the ownership query server-side and refuses a boat that is not the selected
 * operator's. A schedule carries no operatorId of its own, so a mismatch here
 * would silently attach the schedule, and its bookings and payouts, to the
 * wrong tenant.
 *
 * On edit the operator is fixed. Moving a schedule between operators would drag
 * its departures and booking history along, so the server rejects it too.
 */
export function OperatorBoatPicker({
  operators,
  boats,
  defaultOperatorId,
  defaultBoatId,
  lockOperator = false,
}: {
  operators: PickerOperator[];
  boats: PickerBoat[];
  defaultOperatorId?: string;
  defaultBoatId?: string;
  lockOperator?: boolean;
}) {
  const [operatorId, setOperatorId] = useState(defaultOperatorId ?? "");
  const forOperator = boats.filter((b) => b.operatorId === operatorId);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="operatorId">Operator</Label>
        {lockOperator ? (
          <>
            <input type="hidden" name="operatorId" value={operatorId} />
            <div className="flex h-10 items-center rounded-md border border-input bg-slate-50 px-3 text-sm text-muted-foreground">
              {operators.find((o) => o.id === operatorId)?.companyName ?? "—"}
            </div>
          </>
        ) : (
          <select
            id="operatorId"
            name="operatorId"
            className={selectClass}
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            required
          >
            <option value="">Select an operator…</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.companyName}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="boatId">Boat</Label>
        <select
          id="boatId"
          name="boatId"
          className={selectClass}
          defaultValue={defaultBoatId ?? ""}
          disabled={!operatorId}
          required
        >
          <option value="">
            {operatorId ? "Select a boat…" : "Choose an operator first"}
          </option>
          {forOperator.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {operatorId && forOperator.length === 0 ? (
          <p className="text-xs text-amber-700">
            This operator has no active boats. Add one under Boats first.
          </p>
        ) : null}
      </div>
    </div>
  );
}
