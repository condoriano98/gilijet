import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createSchedule } from "../../actions";
import { ScheduleFields } from "../../schedule-fields";

export const metadata = { title: "New schedule · Operations" };

export default async function NewSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; operatorId?: string }>;
}) {
  await requireSuperAdmin();
  const { error, operatorId } = await searchParams;

  const [operators, boats] = await Promise.all([
    prisma.operator.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
    prisma.boat.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, operatorId: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/admin/operations/schedules"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← All schedules
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New schedule</CardTitle>
          <CardDescription>
            A recurring route for one boat. Saving generates the next 60 days of
            departures straight away.
          </CardDescription>
        </CardHeader>
        <form action={createSchedule}>
          <CardContent className="space-y-4">
            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            {operators.length === 0 ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                No active operators. Approve one under Operators first.
              </p>
            ) : null}
            <ScheduleFields
              operators={operators}
              boats={boats}
              defaultOperatorId={operatorId}
            />
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="outline" asChild>
              <Link href="/admin/operations/schedules">Cancel</Link>
            </Button>
            <Button type="submit">Create schedule</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
