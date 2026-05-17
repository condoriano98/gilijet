import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function OperatorDashboardPage() {
  const session = await requireOperator();
  const operator = await prisma.operator.findUnique({
    where: { id: session.sub },
    include: { _count: { select: { boats: true } } },
  });
  if (!operator) redirect("/operator/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome, {operator.contactPerson}
        </h1>
        <p className="text-sm text-muted-foreground">{operator.companyName}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Your boats</CardDescription>
            <CardTitle className="text-3xl">
              {operator._count.boats}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Manage your fleet from the Boats tab.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Today&apos;s departures</CardDescription>
            <CardTitle className="text-3xl">—</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Scheduling and the manifest view ship in Phase 3.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>This week&apos;s revenue</CardDescription>
            <CardTitle className="text-3xl">—</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Daily settlements ship in Phase 4.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What&apos;s here today (Phase 1)</CardTitle>
          <CardDescription>
            Foundation milestone — booking flow comes next.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <ul className="list-disc space-y-1 pl-5">
            <li>Operator + admin authentication</li>
            <li>Admin can onboard / approve / suspend operators</li>
            <li>Database schema for every entity in the spec</li>
            <li>Pricing, refund, and QR signing libraries (unit-tested logic)</li>
          </ul>
          <p className="pt-2 text-xs text-muted-foreground">
            Schedule / departure / scanner pages appear in Phase 3.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
