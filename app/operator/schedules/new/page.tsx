import { redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getOperatorBoats } from "@/lib/operator-data";
import { generateLegsForSchedule } from "@/lib/legs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DaysOfWeekPicker } from "@/components/operator/days-picker";

const daysCsv = z
  .string()
  .min(1, "Pick at least one day")
  .transform((v) => v.split(",").map((n) => Number(n)).filter(Number.isInteger))
  .refine((v) => v.length > 0, "Pick at least one day")
  .refine(
    (v) => v.every((d) => d >= 1 && d <= 7),
    "Day values must be 1-7",
  );

const newScheduleSchema = z.object({
  boatId: z.string().min(1),
  originPort: z.string().min(2).max(80),
  destinationPort: z.string().min(2).max(80),
  departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM"),
  durationMinutes: z.coerce.number().int().min(5).max(720),
  basePrice: z.coerce.number().int().min(1000).max(50_000_000),
  daysOfWeek: daysCsv,
});

async function createScheduleAction(formData: FormData) {
  "use server";
  const session = await requireOperator();
  const parsed = newScheduleSchema.safeParse({
    boatId: formData.get("boatId"),
    originPort: formData.get("originPort"),
    destinationPort: formData.get("destinationPort"),
    departureTime: formData.get("departureTime"),
    durationMinutes: formData.get("durationMinutes"),
    basePrice: formData.get("basePrice"),
    daysOfWeek: formData.get("daysOfWeek"),
  });
  if (!parsed.success) {
    redirect(
      "/operator/schedules/new?error=" +
        encodeURIComponent(parsed.error.issues[0].message),
    );
  }

  // Verify boat belongs to this operator before referencing it.
  const boat = await prisma.boat.findFirst({
    where: { id: parsed.data.boatId, operatorId: session.sub },
  });
  if (!boat) redirect("/operator/schedules/new?error=Boat%20not%20found");

  if (parsed.data.originPort.trim() === parsed.data.destinationPort.trim()) {
    redirect(
      "/operator/schedules/new?error=" +
        encodeURIComponent("Origin and destination must differ"),
    );
  }

  const schedule = await prisma.schedule.create({
    data: {
      boatId: boat.id,
      originPort: parsed.data.originPort.trim(),
      destinationPort: parsed.data.destinationPort.trim(),
      departureTime: parsed.data.departureTime,
      durationMinutes: parsed.data.durationMinutes,
      basePrice: parsed.data.basePrice,
      daysOfWeek: parsed.data.daysOfWeek,
      status: "ACTIVE",
    },
  });

  await audit({
    entityType: "SCHEDULE",
    entityId: schedule.id,
    action: "created",
    userId: session.sub,
    userRole: "OPERATOR",
    newState: {
      route: `${schedule.originPort} → ${schedule.destinationPort}`,
      time: schedule.departureTime,
      days: schedule.daysOfWeek,
    },
  });

  // Eagerly populate the next 14 days of departures.
  await generateLegsForSchedule(schedule.id);

  redirect(`/operator/schedules/${schedule.id}`);
}

export default async function NewSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireOperator();
  const { error } = await searchParams;
  const boats = await getOperatorBoats(session.sub);
  const activeBoats = boats.filter((b) => b.status === "ACTIVE");

  if (activeBoats.length === 0) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">New schedule</h1>
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            You need an active boat first.
            <div className="mt-4">
              <Button asChild>
                <Link href="/operator/boats/new">Add a boat</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/operator/schedules"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← All schedules
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">New schedule</h1>
      </div>

      <form action={createScheduleAction}>
        <Card>
          <CardHeader>
            <CardTitle>Route &amp; timing</CardTitle>
            <CardDescription>
              Creates the schedule and immediately generates departures for the
              next 14 days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="boatId">Boat</Label>
              <select
                id="boatId"
                name="boatId"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {activeBoats.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.capacity} seats
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="originPort">Origin port</Label>
                <Input
                  id="originPort"
                  name="originPort"
                  placeholder="e.g. Sanur"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="destinationPort">Destination port</Label>
                <Input
                  id="destinationPort"
                  name="destinationPort"
                  placeholder="e.g. Nusa Penida"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="departureTime">Departure (HH:MM)</Label>
                <Input
                  id="departureTime"
                  name="departureTime"
                  type="time"
                  required
                />
                <p className="text-xs text-muted-foreground">WITA (UTC+8)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="durationMinutes">Duration (min)</Label>
                <Input
                  id="durationMinutes"
                  name="durationMinutes"
                  type="number"
                  min={5}
                  max={720}
                  defaultValue={45}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="basePrice">Price (IDR)</Label>
                <Input
                  id="basePrice"
                  name="basePrice"
                  type="number"
                  min={1000}
                  step={1000}
                  defaultValue={250000}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Operating days</Label>
              <DaysOfWeekPicker defaultValue={[1, 2, 3, 4, 5, 6, 7]} />
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button asChild variant="ghost">
              <Link href="/operator/schedules">Cancel</Link>
            </Button>
            <Button type="submit">Create &amp; generate departures</Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
