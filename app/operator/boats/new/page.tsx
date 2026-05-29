import { redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/auth";
import { audit } from "@/lib/audit";
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

const newBoatSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  registrationNumber: z
    .string()
    .min(2, "Registration number is required")
    .max(40),
  capacity: z.coerce.number().int().min(1).max(500),
  description: z.string().max(1000).optional().or(z.literal("")),
});

function parsePhotoUrls(raw: string): string[] {
  return raw
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\/.+/i.test(s))
    .slice(0, 8);
}

async function createBoatAction(formData: FormData) {
  "use server";
  const session = await requireOperator();
  const parsed = newBoatSchema.safeParse({
    name: formData.get("name"),
    registrationNumber: formData.get("registrationNumber"),
    capacity: formData.get("capacity"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    redirect(
      `/operator/boats/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`,
    );
  }

  const photos = parsePhotoUrls(String(formData.get("photos") ?? ""));

  try {
    const boat = await prisma.boat.create({
      data: {
        operatorId: session.sub,
        name: parsed.data.name,
        registrationNumber: parsed.data.registrationNumber,
        capacity: parsed.data.capacity,
        description: parsed.data.description || null,
        photos,
        status: "ACTIVE",
      },
    });

    await audit({
      entityType: "boat",
      entityId: boat.id,
      action: "created",
      userId: session.sub,
      userRole: "operator",
      newState: { name: boat.name, capacity: boat.capacity },
    });

    redirect("/operator/boats");
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      redirect(
        "/operator/boats/new?error=" +
          encodeURIComponent("Registration number already in use"),
      );
    }
    throw err;
  }
}

export default async function NewBoatPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireOperator();
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href="/operator/boats"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← All boats
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">New boat</h1>
      </div>

      <form action={createBoatAction}>
        <Card>
          <CardHeader>
            <CardTitle>Vessel details</CardTitle>
            <CardDescription>
              Capacity is locked in once departures are generated; bumping it
              later only affects future legs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="name">Boat name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="registrationNumber">Registration #</Label>
                <Input
                  id="registrationNumber"
                  name="registrationNumber"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity (seats)</Label>
                <Input
                  id="capacity"
                  name="capacity"
                  type="number"
                  min={1}
                  max={500}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                placeholder="What's on board, amenities, etc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="photos">Photo URLs (optional)</Label>
              <Textarea
                id="photos"
                name="photos"
                rows={3}
                placeholder={"One URL per line, e.g.\nhttps://example.com/boat-1.jpg"}
              />
              <p className="text-xs text-muted-foreground">
                Paste up to 8 image links. They appear on search results and
                booking pages.
              </p>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button asChild variant="ghost">
              <Link href="/operator/boats">Cancel</Link>
            </Button>
            <Button type="submit">Create boat</Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
