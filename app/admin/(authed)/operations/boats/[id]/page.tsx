import Link from "next/link";
import { notFound } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { updateBoat } from "../../actions";

export const metadata = { title: "Boat · Operations" };

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export default async function OperationsBoatDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const { error, ok } = await searchParams;

  const boat = await prisma.boat.findFirst({
    where: { id, deletedAt: null },
    include: {
      operator: { select: { id: true, companyName: true } },
      schedules: {
        where: { deletedAt: null },
        select: {
          id: true,
          originPort: true,
          destinationPort: true,
          departureTime: true,
          status: true,
        },
      },
    },
  });
  if (!boat) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/operations/boats"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← All boats
          </Link>
          <h2 className="mt-1 text-xl font-bold tracking-tight">{boat.name}</h2>
          <p className="text-sm text-muted-foreground">
            {boat.operator.companyName}
          </p>
        </div>
        <Badge variant={boat.status === "ACTIVE" ? "success" : "outline"}>
          {boat.status}
        </Badge>
      </div>

      {ok ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Saved.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>The owning operator is fixed.</CardDescription>
        </CardHeader>
        <form action={updateBoat}>
          <CardContent className="space-y-4">
            <input type="hidden" name="id" value={boat.id} />

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="name">Boat name</Label>
                <Input id="name" name="name" defaultValue={boat.name} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="registrationNumber">Registration number</Label>
                <Input
                  id="registrationNumber"
                  name="registrationNumber"
                  defaultValue={boat.registrationNumber}
                  required
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={boat.status}
                  className={selectClass}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={boat.description ?? ""}
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit">Save changes</Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedules using this boat ({boat.schedules.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {boat.schedules.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              None yet.{" "}
              <Link
                href={`/admin/operations/schedules/new?operatorId=${boat.operator.id}`}
                className="text-sky-700 hover:underline"
              >
                Create one
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {boat.schedules.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/admin/operations/schedules/${s.id}`}
                    className="hover:underline"
                  >
                    {s.originPort} → {s.destinationPort} at {s.departureTime}
                  </Link>{" "}
                  <span className="text-muted-foreground">({s.status})</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
