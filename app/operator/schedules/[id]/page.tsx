import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { ScheduleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getOperatorSchedule } from "@/lib/operator-data";
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
import { Badge } from "@/components/ui/badge";
import { DaysOfWeekPicker } from "@/components/operator/days-picker";
import { formatLocalDateTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";

const daysCsv = z
  .string()
  .min(1)
  .transform((v) => v.split(",").map((n) => Number(n)).filter(Number.isInteger))
  .refine((v) => v.length > 0)
  .refine((v) => v.every((d) => d >= 1 && d <= 7));

const updateScheduleSchema = z.object({
  id: z.string(),
  originPort: z.string().min(2).max(80),
  destinationPort: z.string().min(2).max(80),
  departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.coerce.number().int().min(5).max(720),
  basePrice: z.coerce.number().int().min(1000).max(50_000_000),
  daysOfWeek: daysCsv,
  status: z.nativeEnum(ScheduleStatus),
});

async function updateScheduleAction(formData: FormData) {
  "use server";
  const session = await requireOperator();
  const parsed = updateScheduleSchema.safeParse({
    id: formData.get("id"),
    originPort: formData.get("originPort"),
    destinationPort: formData.get("destinationPort"),
    departureTime: formData.get("departureTime"),
    durationMinutes: formData.get("durationMinutes"),
    basePrice: formData.get("basePrice"),
    daysOfWeek: formData.get("daysOfWeek"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    redirect(
      `/operator/schedules/${formData.get("id")}?error=` +
        encodeURIComponent(parsed.error.issues[0].message),
    );
  }

  const existing = await getOperatorSchedule(session.sub, parsed.data.id);
  if (!existing) redirect("/operator/schedules");

  const updated = await prisma.schedule.update({
    where: { id: parsed.data.id },
    data: {
      originPort: parsed.data.originPort.trim(),
      destinationPort: parsed.data.destinationPort.trim(),
      departureTime: parsed.data.departureTime,
      durationMinutes: parsed.data.durationMinutes,
      basePrice: parsed.data.basePrice,
      daysOfWeek: parsed.data.daysOfWeek,
      status: parsed.data.status,
    },
  });

  await audit({
    entityType: "SCHEDULE",
    entityId: updated.id,
    action: "updated",
    userId: session.sub,
    userRole: "OPERATOR",
    previousState: {
      route: `${existing.originPort} → ${existing.destinationPort}`,
      time: existing.departureTime,
      days: existing.daysOfWeek,
      status: existing.status,
    },
    newState: {
      route: `${updated.originPort} → ${updated.destinationPort}`,
      time: updated.departureTime,
      days: updated.daysOfWeek,
      status: updated.status,
    },
  });

  redirect(`/operator/schedules/${updated.id}?ok=saved`);
}

async function regenerateLegsAction(formData: FormData) {
  "use server";
  const session = await requireOperator();
  const id = String(formData.get("id") ?? "");
  const schedule = await getOperatorSchedule(session.sub, id);
  if (!schedule) redirect("/operator/schedules");
  const created = await generateLegsForSchedule(schedule.id);
  redirect(`/operator/schedules/${id}?ok=generated_${created}`);
}

function flashMessage(ok?: string): string | null {
  if (!ok) return null;
  if (ok === "saved") return "Saved.";
  if (ok.startsWith("generated_")) {
    const n = Number(ok.slice("generated_".length));
    return `Generated ${n} new departure${n === 1 ? "" : "s"} for the next 14 days.`;
  }
  return null;
}

export default async function EditSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireOperator();
  const { id } = await params;
  const { error, ok } = await searchParams;
  const schedule = await getOperatorSchedule(session.sub, id);
  if (!schedule) notFound();

  // Upcoming legs (next 30 days) to show on this page.
  const upcoming = await prisma.leg.findMany({
    where: { scheduleId: schedule.id, operatorId: session.sub, departureDate: { gte: new Date() } },
    orderBy: { departureDate: "asc" },
    take: 14,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/operator/schedules"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← All schedules
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {schedule.originPort} → {schedule.destinationPort}
        </h1>
        <p className="text-sm text-muted-foreground">
          {schedule.boat.name} · {schedule.departureTime} WITA
        </p>
      </div>

      {flashMessage(ok) ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {flashMessage(ok)}
        </p>
      ) : null}

      <form action={updateScheduleAction}>
        <input type="hidden" name="id" value={schedule.id} />
        <Card>
          <CardHeader>
            <CardTitle>Edit schedule</CardTitle>
            <CardDescription>
              Changes apply to future leg generation. Existing legs keep their
              original price.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="originPort">Origin port</Label>
                <Input
                  id="originPort"
                  name="originPort"
                  defaultValue={schedule.originPort}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="destinationPort">Destination port</Label>
                <Input
                  id="destinationPort"
                  name="destinationPort"
                  defaultValue={schedule.destinationPort}
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
                  defaultValue={schedule.departureTime}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="durationMinutes">Duration (min)</Label>
                <Input
                  id="durationMinutes"
                  name="durationMinutes"
                  type="number"
                  min={5}
                  max={720}
                  defaultValue={schedule.durationMinutes}
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
                  defaultValue={Number(schedule.basePrice)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Operating days</Label>
              <DaysOfWeekPicker defaultValue={schedule.daysOfWeek} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue={schedule.status}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive (no new legs)</option>
              </select>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button type="submit">Save changes</Button>
          </CardFooter>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Upcoming departures</CardTitle>
              <CardDescription>
                Concrete legs generated from this schedule.
              </CardDescription>
            </div>
            <form action={regenerateLegsAction}>
              <input type="hidden" name="id" value={schedule.id} />
              <Button type="submit" variant="outline" size="sm">
                Generate next 14 days
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No upcoming departures. Click &ldquo;Generate next 14 days&rdquo;.
            </p>
          ) : (
            <ul className="divide-y">
              {upcoming.map((leg) => (
                <li
                  key={leg.id}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <div className="font-medium">
                      {formatLocalDateTime(leg.departureDate)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatIDR(Number(leg.basePrice))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={leg.status === "CANCELLED" ? "destructive" : "outline"}
                    >
                      {leg.status}
                    </Badge>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/operator/legs/${leg.id}`}>Manifest</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
