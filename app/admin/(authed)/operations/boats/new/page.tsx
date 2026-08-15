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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createBoat } from "../../actions";

export const metadata = { title: "Add boat · Operations" };

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export default async function NewBoatPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; operatorId?: string }>;
}) {
  await requireSuperAdmin();
  const { error, operatorId } = await searchParams;

  const operators = await prisma.operator.findMany({
    where: { deletedAt: null },
    orderBy: { companyName: "asc" },
    select: { id: true, companyName: true, status: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/admin/operations/boats"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← All boats
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Add boat</CardTitle>
          <CardDescription>
            The owning operator is set once and cannot be changed later — moving
            a boat would take its schedules and booking history with it.
          </CardDescription>
        </CardHeader>
        <form action={createBoat}>
          <CardContent className="space-y-4">
            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="grid gap-1.5">
              <Label htmlFor="operatorId">Operator</Label>
              <select
                id="operatorId"
                name="operatorId"
                defaultValue={operatorId ?? ""}
                className={selectClass}
                required
              >
                <option value="">Select an operator…</option>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.companyName}
                    {o.status !== "ACTIVE" ? ` (${o.status})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="name">Boat name</Label>
                <Input id="name" name="name" placeholder="Gili Cat I" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="registrationNumber">Registration number</Label>
                <Input
                  id="registrationNumber"
                  name="registrationNumber"
                  placeholder="GT.123/PST"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Must be unique across the platform.
                </p>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Shown to customers when browsing this route."
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="outline" asChild>
              <Link href="/admin/operations/boats">Cancel</Link>
            </Button>
            <Button type="submit">Add boat</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
