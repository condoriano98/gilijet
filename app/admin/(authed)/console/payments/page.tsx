import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { applyGatewayModeOverrides } from "@/lib/payment-mode";
import { pingDoku } from "@/lib/doku";
import { pingPaypal } from "@/lib/paypal";
import { savePaymentModes } from "../actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const dynamic = "force-dynamic";

const MODE_LABELS: Record<string, string> = {
  ENV: "Follow env vars",
  SANDBOX: "Sandbox (test)",
  LIVE: "Live",
};

/**
 * Runtime sandbox/live toggle for the payment gateways. Persisted on the
 * PlatformConfig row (so it survives and applies without a redeploy) and read
 * at every checkout / pay-page render via lib/payment-mode.ts.
 */
export default async function PaymentsConsolePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireSuperAdmin();
  const { ok, error } = await searchParams;

  // Apply first so the status below reflects what checkout will actually do.
  await applyGatewayModeOverrides();
  const config = await prisma.platformConfig.findUnique({
    where: { id: "default" },
  });
  const doku = pingDoku();
  const paypal = pingPaypal();

  const dokuMode = config?.dokuMode ?? "ENV";
  const paypalMode = config?.paypalMode ?? "ENV";

  return (
    <div className="space-y-6">
      {ok && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="py-3 text-sm text-emerald-900">
            Payment gateway modes saved.
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
          <CardTitle>Payment gateway modes</CardTitle>
          <CardDescription>
            Choose which host each gateway talks to. &ldquo;Follow env
            vars&rdquo; keeps the DOKU_IS_PRODUCTION / PAYPAL_IS_PRODUCTION
            behaviour; the other two override it from here, with no redeploy.
            Saved to the database and read at every checkout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={savePaymentModes} className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dokuMode">DOKU Checkout</Label>
                <Select name="dokuMode" defaultValue={dokuMode}>
                  <SelectTrigger id="dokuMode">
                    <SelectValue placeholder="Choose mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Effective:{" "}
                  {doku.mode === "mock"
                    ? "mock (no DOKU keys set)"
                    : `${doku.mode} host`}
                  {doku.override !== "ENV"
                    ? " — forced by this console"
                    : doku.mode !== "mock"
                      ? " — from DOKU_IS_PRODUCTION"
                      : ""}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="paypalMode">PayPal</Label>
                <Select name="paypalMode" defaultValue={paypalMode}>
                  <SelectTrigger id="paypalMode">
                    <SelectValue placeholder="Choose mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Effective:{" "}
                  {paypal.mode === "mock"
                    ? "mock (no PayPal keys set)"
                    : `${paypal.mode} host${paypal.modeProven ? " (confirmed by PayPal)" : " (unconfirmed)"}`}
                  {paypal.override !== "ENV"
                    ? " — forced by this console"
                    : paypal.mode !== "mock"
                      ? " — from PAYPAL_IS_PRODUCTION"
                      : ""}
                </p>
              </div>
            </div>

            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Sandbox hosts take no real money but still confirm bookings and
              issue tickets. A customer sees a test-mode warning on the pay
              page, and /admin/diagnostics turns red. Never ship a LIVE host
              without live credentials, or every payment will fail.
            </p>

            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}