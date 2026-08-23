import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { isWhatsappConfigured, normalizeWhatsappNumber } from "@/lib/whatsapp";
import { saveAlertConfig } from "../actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

/**
 * Where booking alerts go. Database-first so the on-call number can move
 * between staff without a redeploy; the env vars only cover an environment
 * with no config row yet.
 */
export default async function AlertsConsolePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireSuperAdmin();
  const { ok, error } = await searchParams;

  const config = await prisma.platformConfig.findUnique({
    where: { id: "default" },
  });

  const number = config?.adminWhatsappNumber ?? "";
  const template = config?.adminAlertTemplate ?? "";
  const effectiveNumber = number || env.ADMIN_WHATSAPP_NUMBER || "";
  const effectiveTemplate = template || env.ADMIN_ALERT_TEMPLATE || "";
  const normalised = effectiveNumber
    ? normalizeWhatsappNumber(effectiveNumber)
    : null;
  const live = isWhatsappConfigured();
  const armed = Boolean(effectiveNumber && effectiveTemplate);

  return (
    <div className="space-y-6">
      {ok && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="py-3 text-sm text-emerald-900">
            Alert settings saved.
          </CardContent>
        </Card>
      )}
      {error && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="py-3 text-sm text-rose-900">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Booking alerts</CardTitle>
          <CardDescription>
            WhatsApp the person on call when a booking comes in. Leave the
            number or template blank to switch alerts off entirely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveAlertConfig} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="adminWhatsappNumber">
                Destination WhatsApp number
              </Label>
              <Input
                id="adminWhatsappNumber"
                name="adminWhatsappNumber"
                defaultValue={number}
                placeholder="0812 3456 7890"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {normalised
                  ? `Sends to ${normalised}.`
                  : "08…, +62… and 62… are all accepted."}
                {!number && env.ADMIN_WHATSAPP_NUMBER
                  ? " Currently falling back to ADMIN_WHATSAPP_NUMBER."
                  : ""}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adminAlertTemplate">WATI template name</Label>
              <Input
                id="adminAlertTemplate"
                name="adminAlertTemplate"
                defaultValue={template}
                placeholder="gilifast_booking_alert"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Must be an approved template in WATI. WhatsApp only allows a
                business to start a conversation with a template — a plain
                message reaches someone only within 24 hours of them messaging
                you, which staff never do.
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Send an alert when</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="alertOnNewBooking"
                  defaultChecked={config?.alertOnNewBooking ?? true}
                  className="h-4 w-4"
                />
                A seat is reserved — not yet paid, and may expire
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="alertOnBookingPaid"
                  defaultChecked={config?.alertOnBookingPaid ?? true}
                  className="h-4 w-4"
                />
                Payment settles — time to ring the operator
              </label>
            </fieldset>

            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            {armed
              ? "✓ Alerts are configured."
              : "✗ Alerts are off — set both a number and a template name."}
          </p>
          <p className={live ? "" : "text-amber-700"}>
            {live
              ? "✓ WATI credentials are present, so alerts send for real."
              : "✗ WATI credentials are absent — alerts are written to the server log instead of sent. Set WATI_API_KEY, WATI_TENANT_ID and WATI_API_URL."}
          </p>
          <p className="text-xs text-muted-foreground">
            The template needs these variables: event, reference, route,
            departure, boat, customer, pax, amount, action.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
