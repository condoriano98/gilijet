import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { BoatStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getOperatorBoat } from "@/lib/operator-data";
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

const updateBoatSchema = z.object({
  id: z.string(),
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional().or(z.literal("")),
  status: z.nativeEnum(BoatStatus),
});

function parsePhotoUrls(raw: string): string[] {
  return raw
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\/.+/i.test(s))
    .slice(0, 8);
}

async function updateBoatAction(formData: FormData) {
  "use server";
  const session = await requireOperator();
  const parsed = updateBoatSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    redirect(
      `/operator/boats/${formData.get("id")}?error=` +
        encodeURIComponent(parsed.error.issues[0].message),
    );
  }

  const existing = await getOperatorBoat(session.sub, parsed.data.id);
  if (!existing) redirect("/operator/boats");

  const photos = parsePhotoUrls(String(formData.get("photos") ?? ""));

  const updated = await prisma.boat.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      status: parsed.data.status,
      photos,
    },
  });

  await audit({
    entityType: "BOAT",
    entityId: updated.id,
    action: "updated",
    userId: session.sub,
    userRole: "OPERATOR",
    previousState: {
      name: existing.name,
      status: existing.status,
    },
    newState: {
      name: updated.name,
      status: updated.status,
    },
  });

  redirect("/operator/boats");
}

export default async function EditBoatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireOperator();
  const { id } = await params;
  const { error } = await searchParams;
  const boat = await getOperatorBoat(session.sub, id);
  if (!boat) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href="/operator/boats"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← All boats
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{boat.name}</h1>
        <p className="text-sm text-muted-foreground">
          {boat.registrationNumber}
        </p>
      </div>

      <form action={updateBoatAction}>
        <input type="hidden" name="id" value={boat.id} />
        <Card>
          <CardHeader>
            <CardTitle>Edit boat</CardTitle>
            <CardDescription>
              Registration number is locked once the boat is created.
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
              <Input id="name" name="name" defaultValue={boat.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue={boat.status}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="ACTIVE">Active</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={boat.description ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="photos">Photo URLs</Label>
              <Textarea
                id="photos"
                name="photos"
                rows={3}
                defaultValue={boat.photos.join("\n")}
                placeholder={"One URL per line, e.g.\nhttps://example.com/boat-1.jpg"}
              />
              <p className="text-xs text-muted-foreground">
                Up to 8 image links, one per line.
              </p>
              {boat.photos.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {boat.photos.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt="Boat"
                      className="h-16 w-24 rounded-md border object-cover"
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="justify-between gap-2">
            <div className="flex gap-2">
              <Button asChild variant="ghost">
                <Link href="/operator/boats">Cancel</Link>
              </Button>
              <Button type="submit">Save changes</Button>
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
