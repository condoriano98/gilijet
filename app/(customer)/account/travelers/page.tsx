import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCustomer } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const metadata = { title: "Saved Travelers · Gilijet" };

const travelerSchema = z.object({
  fullName: z.string().min(2).max(120),
  idNumber: z.string().max(40).optional().or(z.literal("")),
  type: z.enum(["ADULT", "CHILD", "INFANT"]),
  phoneNumber: z.string().max(40).optional().or(z.literal("")),
  nationality: z.string().max(80).optional().or(z.literal("")),
});

async function addTravelerAction(formData: FormData) {
  "use server";
  const session = await requireCustomer();
  const parsed = travelerSchema.safeParse({
    fullName: formData.get("fullName"),
    idNumber: formData.get("idNumber"),
    type: formData.get("type"),
    phoneNumber: formData.get("phoneNumber"),
    nationality: formData.get("nationality"),
  });
  if (!parsed.success) {
    redirect(`/account/travelers?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }
  await prisma.traveler.create({
    data: {
      customerId: session.sub,
      fullName: parsed.data.fullName.trim(),
      idNumber: parsed.data.idNumber?.trim() || null,
      type: parsed.data.type,
      phoneNumber: parsed.data.phoneNumber?.trim() || null,
      nationality: parsed.data.nationality?.trim() || null,
    },
  });
  redirect("/account/travelers?ok=traveler_added");
}

async function deleteTravelerAction(formData: FormData) {
  "use server";
  const session = await requireCustomer();
  const travelerId = formData.get("travelerId") as string;
  if (!travelerId) redirect("/account/travelers?error=invalid_id");
  await prisma.traveler.delete({
    where: { id: travelerId, customerId: session.sub },
  });
  redirect("/account/travelers?ok=traveler_deleted");
}

export default async function TravelersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const session = await requireCustomer();

  const travelers = await prisma.traveler.findMany({
    where: { customerId: session.sub },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="container py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Saved Travelers</h1>
            <p className="text-sm text-slate-600">
              Quickly fill passenger details when booking
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/account">← Back to account</Link>
          </Button>
        </div>

        {ok ? (
          <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {ok.replace(/_/g, " ")} ✓
          </p>
        ) : null}
        {error ? (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error.replace(/_/g, " ")}
          </p>
        ) : null}

        {travelers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="mb-4 text-sm text-slate-600">
                No saved travelers yet. Add frequent passengers to speed up booking.
              </p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Add your first traveler</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Traveler</DialogTitle>
                    <DialogDescription>
                      Save passenger details for faster booking
                    </DialogDescription>
                  </DialogHeader>
                  <form action={addTravelerAction} className="space-y-4">
                    <div className="space-y-1">
                      <Label htmlFor="fullName">Full name *</Label>
                      <Input id="fullName" name="fullName" required minLength={2} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="type">Type *</Label>
                      <Select name="type" defaultValue="ADULT">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADULT">Adult (12+)</SelectItem>
                          <SelectItem value="CHILD">Child (2-11)</SelectItem>
                          <SelectItem value="INFANT">Infant (&lt;2)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="idNumber">ID Number (KTP/Passport)</Label>
                      <Input id="idNumber" name="idNumber" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="phoneNumber">Phone</Label>
                      <Input id="phoneNumber" name="phoneNumber" type="tel" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="nationality">Nationality</Label>
                      <Input id="nationality" name="nationality" />
                    </div>
                    <DialogFooter>
                      <Button type="submit">Save Traveler</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-4 flex justify-end">
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm">+ Add Traveler</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Traveler</DialogTitle>
                    <DialogDescription>
                      Save passenger details for faster booking
                    </DialogDescription>
                  </DialogHeader>
                  <form action={addTravelerAction} className="space-y-4">
                    <div className="space-y-1">
                      <Label htmlFor="fullName">Full name *</Label>
                      <Input id="fullName" name="fullName" required minLength={2} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="type">Type *</Label>
                      <Select name="type" defaultValue="ADULT">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADULT">Adult (12+)</SelectItem>
                          <SelectItem value="CHILD">Child (2-11)</SelectItem>
                          <SelectItem value="INFANT">Infant (&lt;2)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="idNumber">ID Number (KTP/Passport)</Label>
                      <Input id="idNumber" name="idNumber" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="phoneNumber">Phone</Label>
                      <Input id="phoneNumber" name="phoneNumber" type="tel" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="nationality">Nationality</Label>
                      <Input id="nationality" name="nationality" />
                    </div>
                    <DialogFooter>
                      <Button type="submit">Save Traveler</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-3">
              {travelers.map((t) => (
                <Card key={t.id}>
                  <CardContent className="flex items-start justify-between gap-4 p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{t.fullName}</span>
                        <Badge variant="outline" className="text-xs">
                          {t.type}
                        </Badge>
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {t.idNumber ? `ID: ${t.idNumber} · ` : null}
                        {t.phoneNumber ? `${t.phoneNumber} · ` : null}
                        {t.nationality ?? "No nationality"}
                      </div>
                    </div>
                    <form action={deleteTravelerAction}>
                      <input type="hidden" name="travelerId" value={t.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        Delete
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
