import type { Schedule } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DaysOfWeekPicker } from "@/components/operator/days-picker";
import {
  OperatorBoatPicker,
  type PickerBoat,
  type PickerOperator,
} from "./operator-boat-picker";

/**
 * Shared fields for the schedule create and edit forms. Each page owns its own
 * <form action={…}> and drops this inside, matching the coupon-fields pattern
 * in the owner console.
 */
export function ScheduleFields({
  schedule,
  operators,
  boats,
  defaultOperatorId,
  editing,
}: {
  schedule?: Schedule;
  operators: PickerOperator[];
  boats: PickerBoat[];
  defaultOperatorId?: string;
  editing?: boolean;
}) {
  return (
    <div className="grid gap-5">
      <OperatorBoatPicker
        operators={operators}
        boats={boats}
        defaultOperatorId={defaultOperatorId}
        defaultBoatId={schedule?.boatId}
        lockOperator={editing}
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="originPort">From</Label>
          <Input
            id="originPort"
            name="originPort"
            defaultValue={schedule?.originPort}
            placeholder="Sanur"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="destinationPort">To</Label>
          <Input
            id="destinationPort"
            name="destinationPort"
            defaultValue={schedule?.destinationPort}
            placeholder="Nusa Penida"
            required
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="departureTime">Departure (WITA)</Label>
          <Input
            id="departureTime"
            name="departureTime"
            type="time"
            defaultValue={schedule?.departureTime ?? "08:00"}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="durationMinutes">Duration (minutes)</Label>
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min="5"
            max="720"
            defaultValue={schedule?.durationMinutes ?? 45}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="basePrice">Base price (IDR)</Label>
          <Input
            id="basePrice"
            name="basePrice"
            type="number"
            min="1000"
            step="1000"
            defaultValue={schedule ? Number(schedule.basePrice) : 250000}
            required
          />
          <p className="text-xs text-muted-foreground">
            Per adult. Children and infants follow the platform multipliers.
          </p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Runs on</Label>
        <DaysOfWeekPicker defaultValue={schedule?.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7]} />
        <p className="text-xs text-muted-foreground">
          Departures are generated for these days across the next 60 days.
        </p>
      </div>
    </div>
  );
}
