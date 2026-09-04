import { requireSuperAdmin } from "@/lib/auth";
import { pingMidtrans, isMidtransLive, NOTIFICATION_PATH } from "@/lib/midtrans";
import { whatsappProvider } from "@/lib/whatsapp";
import { isEmailConfigured } from "@/lib/email";
import {
  pingPaypal,
  isPaypalLive,
  paypalCredentialsWork,
  paypalPresentmentCurrency,
} from "@/lib/paypal";
import { quoteForeignCharge, MAX_RATE_AGE_MS } from "@/lib/fx";
import { applyGatewayModeOverrides } from "@/lib/payment-mode";
import { formatLocalDateTime } from "@/lib/datetime";
import { env } from "@/lib/env";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Diagnostics · Admin" };
export const dynamic = "force-dynamic";

/**
 * Read-only gateway status. Exists because "why is checkout falling back to the
 * dummy flow?" was otherwise only answerable by SSH-ing to the box and grepping
 * the env file.
 *
 * Never renders a secret. Only presence, mode, and the client-id prefix.
 */

type Row = { label: string; ok: boolean; detail: string };

function StatusRow({ row }: { row: Row }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-sm text-slate-600">{row.label}</span>
      <span className="flex items-center gap-2 text-right">
        <span className="text-xs text-slate-500">{row.detail}</span>
        <Badge variant={row.ok ? "default" : "outline"}>
          {row.ok ? "ok" : "off"}
        </Badge>
      </span>
    </div>
  );
}

export default async function DiagnosticsPage() {
  await requireSuperAdmin();

  // Reflect any console sandbox/live override before pinging, so this page
  // reports the host checkout will actually use (see lib/payment-mode.ts).
  await applyGatewayModeOverrides();

  const midtrans = pingMidtrans();
  const notificationUrl = `${env.APP_BASE_URL}${NOTIFICATION_PATH}`;

  // Run the same call the pay page makes, so this page goes red exactly when
  // checkout would rather than showing a green light nobody sees.
  const currency = paypalPresentmentCurrency();
  let fxOk = false;
  let fxDetail: string;
  try {
    const quote = await quoteForeignCharge(1_000_000, currency);
    fxOk = true;
    fxDetail = `1,000,000 IDR = ${quote.amount} ${quote.currency} · quoted ${formatLocalDateTime(quote.quotedAt)} WITA`;
  } catch (err) {
    fxDetail = err instanceof Error ? err.message : String(err);
  }

  // Presence is not correctness: the whole reason PayPal silently failed at
  // checkout was credentials that existed but were rejected by the host.
  // Ping *after* this, so `mode` is the host that actually answered rather than
  // the one PAYPAL_IS_PRODUCTION guesses at.
  const paypalAuthenticates = await paypalCredentialsWork();
  const paypal = pingPaypal();

  // Sandbox PayPal alongside live Midtrans means a booking can be "paid" in
  // test money and still get a real ticket. That is worse than PayPal being off.
  const paypalTestModeOnLiveSite = paypal.mode === "sandbox" && isMidtransLive();

  const paypalRows: Row[] = [
    {
      label: "Credentials",
      ok: paypalAuthenticates,
      detail: !paypal.ok
        ? "not set"
        : paypalAuthenticates
          ? `authenticate against the ${paypal.mode} host`
          : "set, but neither the live nor the sandbox host accepts them — the client id or secret is wrong or revoked. Run pnpm paypal:selftest",
    },
    {
      label: "Webhook ID",
      ok: paypal.webhookConfigured,
      detail: paypal.webhookConfigured ? "set" : "not set — webhooks are rejected",
    },
    {
      label: "Mode",
      ok: paypal.mode === "live",
      detail: !paypal.modeProven
        ? `${paypal.mode} (from PAYPAL_IS_PRODUCTION — unconfirmed)${paypal.override !== "ENV" ? `; console override: ${paypal.override}` : ""}`
        : paypalTestModeOnLiveSite
          ? "sandbox — takes NO real money, but Midtrans is live. Customers see a test-mode warning and PayPal bookings issue real tickets for nothing."
          : `${paypal.mode} (confirmed by PayPal)${paypal.override !== "ENV" ? `; console override: ${paypal.override}` : ""}`,
    },
    { label: `FX rate (${currency})`, ok: fxOk, detail: fxDetail },
    {
      label: "Offered at checkout",
      ok: paypalAuthenticates && fxOk,
      detail:
        paypalAuthenticates && fxOk
          ? "yes"
          : !isPaypalLive()
            ? "no — credentials missing"
            : !paypalAuthenticates
              ? "no — credentials rejected by PayPal"
              : "no — no usable FX rate",
    },
  ];

  const rows: Row[] = [
    {
      label: "Server key",
      ok: Boolean(midtrans.serverKeyPrefix),
      detail: midtrans.serverKeyPrefix || "not set",
    },
    {
      label: "Client key",
      ok: midtrans.secretPresent,
      detail: midtrans.secretPresent
        ? "set"
        : "not set — requests cannot be signed",
    },
    { label: "Mode", ok: midtrans.mode === "live", detail: midtrans.mode === "mock" ? "mock (no keys set)" : `${midtrans.mode}${midtrans.override !== "ENV" ? ` (console override: ${midtrans.override})` : " (from MIDTRANS_IS_PRODUCTION)"}` },
    {
      label: "Takes real payments",
      ok: isMidtransLive(),
      detail: isMidtransLive()
        ? "yes"
        : "no — checkout falls back to the dummy flow",
    },
  ];

  const waProvider = whatsappProvider();
  const notificationRows: Row[] = [
    {
      label: "Email (Resend)",
      ok: isEmailConfigured(),
      detail: isEmailConfigured()
        ? "live — emails are delivered by Resend"
        : "off — emails go to the local inbox at /admin/diagnostics/email-inbox",
    },
    {
      label: "WhatsApp",
      ok: Boolean(waProvider),
      detail:
        waProvider === "meta"
          ? "live — Meta WhatsApp Cloud API"
          : waProvider === "wati"
            ? "live — WATI"
            : "off — messages go to the local inbox at /admin/diagnostics/whatsapp-inbox",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          Read-only. Shows whether the gateway can actually take money — no
          secrets are displayed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer notifications</CardTitle>
          <CardDescription>
            When a transport has no API keys it falls back to a local sandbox
            inbox instead of sending — add the keys and the same code paths
            deliver for real.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notificationRows.map((r) => (
            <StatusRow key={r.label} row={r} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Midtrans Snap</CardTitle>
          <CardDescription>
            Both credentials are required: the server key authenticates the
            checkout request, the client key identifies us to the hosted page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.map((r) => (
            <StatusRow key={r.label} row={r} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PayPal — backup for declined cards</CardTitle>
          <CardDescription>
            Only offered when credentials are set <em>and</em> an FX rate newer
            than {MAX_RATE_AGE_MS / 3_600_000}h exists — PayPal cannot settle
            IDR, so without a rate there is no price to quote.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {paypalRows.map((r) => (
            <StatusRow key={r.label} row={r} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification endpoint</CardTitle>
          <CardDescription>
            Register this exact URL in the Midtrans dashboard. Midtrans signs
            the payload, so a mismatch here fails verification even with the
            right server key.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusRow
            row={{
              label: "URL",
              ok: env.APP_BASE_URL.startsWith("https://"),
              detail: env.APP_BASE_URL.startsWith("https://")
                ? notificationUrl
                : `${notificationUrl} — HTTPS strongly recommended`,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
