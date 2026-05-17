import { redirect } from "next/navigation";
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

async function lookupAction(formData: FormData) {
  "use server";
  const ref = String(formData.get("reference") ?? "").trim().toUpperCase();
  if (!ref) redirect("/b?error=missing");
  redirect(`/b/${encodeURIComponent(ref)}`);
}

export default async function BookingLookupHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="container py-12">
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Find your booking</CardTitle>
            <CardDescription>
              Enter the reference from your confirmation email
              (e.g. <span className="font-mono">BK-2026-05-A4C9F1</span>).
            </CardDescription>
          </CardHeader>
          <form action={lookupAction}>
            <CardContent className="space-y-3">
              {error ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  Please enter a reference.
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="reference">Booking reference</Label>
                <Input
                  id="reference"
                  name="reference"
                  required
                  placeholder="BK-2026-05-XXXXXX"
                  autoComplete="off"
                  className="font-mono uppercase"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full">
                Look up
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
