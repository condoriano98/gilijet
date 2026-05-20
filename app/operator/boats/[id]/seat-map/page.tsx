import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getOperatorBoat } from "@/lib/operator-data";
import { generateSeatLayout, parseSeatLayout } from "@/lib/seat-map";
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

const seatMapSchema = z.object({
  boatId: z.string(),
  action: z.enum(["auto-generate", "clear"]),
});

async function updateSeatMapAction(formData: FormData) {
  "use server";
  const session = await requireOperator();
  const parsed = seatMapSchema.safeParse({
    boatId: formData.get("boatId"),
    action: formData.get("action"),
  });
  if (!parsed.success) {
    redirect(`/operator/boats/${formData.get("boatId")}/seat-map?error=invalid`);
  }

  const boat = await getOperatorBoat(session.sub, parsed.data.boatId);
  if (!boat) redirect("/operator/boats");

  let seatLayout = null;
  if (parsed.data.action === "auto-generate") {
    seatLayout = generateSeatLayout(boat.capacity);
  }

  await prisma.boat.update({
    where: { id: boat.id },
    data: { seatLayout: seatLayout ?? undefined },
  });

  await audit({
    entityType: "boat",
    entityId: boat.id,
    action: parsed.data.action === "auto-generate" ? "seat_map_generated" : "seat_map_cleared",
    userId: session.sub,
    userRole: "operator",
    newState: { seatLayout: seatLayout ? `${seatLayout.seats.length} seats` : null },
  });

  redirect(`/operator/boats/${boat.id}/seat-map?ok=1`);
}

export default async function SeatMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const session = await requireOperator();
  const { id } = await params;
  const { ok, error } = await searchParams;
  const boat = await getOperatorBoat(session.sub, id);
  if (!boat) notFound();

  const layout = parseSeatLayout((boat as { seatLayout?: unknown }).seatLayout);
  const COL_LABELS = ["A", "B", "C", "D", "E", "F"];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={`/operator/boats/${boat.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {boat.name}
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Seat map</h1>
        <p className="text-sm text-muted-foreground">
          Define the seating layout for {boat.name}. Customers will see this
          when booking and can pick their seats.
        </p>
      </div>

      {ok ? (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Seat map updated.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Error: {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Current layout</CardTitle>
          <CardDescription>
            {layout
              ? `${layout.seats.length} seats · ${layout.rows} rows × ${layout.cols} cols`
              : "No seat map configured. Customers see a generic availability counter instead."}
          </CardDescription>
        </CardHeader>
        {layout ? (
          <CardContent>
            <div className="overflow-x-auto">
              <div className="inline-block min-w-fit">
                {/* Column headers */}
                <div
                  className="mb-1 grid gap-1 text-center text-xs font-medium text-muted-foreground"
                  style={{ gridTemplateColumns: `1.5rem repeat(${layout.cols}, 2rem)` }}
                >
                  <div />
                  {Array.from({ length: layout.cols }).map((_, c) => (
                    <div key={c}>{COL_LABELS[c] ?? c + 1}</div>
                  ))}
                </div>
                {Array.from({ length: layout.rows }).map((_, r) => (
                  <div
                    key={r}
                    className="mb-1 grid gap-1"
                    style={{ gridTemplateColumns: `1.5rem repeat(${layout.cols}, 2rem)` }}
                  >
                    <div className="flex items-center justify-center text-xs text-muted-foreground">
                      {r + 1}
                    </div>
                    {Array.from({ length: layout.cols }).map((_, c) => {
                      const seat = layout.seats.find(
                        (s) => s.row === r && s.col === c,
                      );
                      return (
                        <div
                          key={c}
                          className={[
                            "flex h-8 w-8 items-center justify-center rounded text-xs",
                            seat
                              ? "border border-sky-300 bg-sky-50 text-sky-700"
                              : "bg-transparent",
                          ].join(" ")}
                        >
                          {seat?.label ?? ""}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        ) : null}
        <CardFooter className="flex flex-wrap gap-2">
          <form action={updateSeatMapAction}>
            <input type="hidden" name="boatId" value={boat.id} />
            <input type="hidden" name="action" value="auto-generate" />
            <Button type="submit">
              {layout ? "Regenerate" : "Auto-generate"} layout ({boat.capacity} seats)
            </Button>
          </form>
          {layout ? (
            <form action={updateSeatMapAction}>
              <input type="hidden" name="boatId" value={boat.id} />
              <input type="hidden" name="action" value="clear" />
              <Button type="submit" variant="outline">
                Remove seat map
              </Button>
            </form>
          ) : null}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing tiers (yield management)</CardTitle>
          <CardDescription>
            Prices automatically increase as seats fill up. Configure tiers on
            the schedule, not the boat.{" "}
            <Link href="/operator/schedules" className="underline">
              Go to schedules →
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
