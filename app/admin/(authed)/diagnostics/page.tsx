import { requireSuperAdmin } from "@/lib/auth";
import { pingDoku, isDokuLive, NOTIFICATION_PATH } from "@/lib/doku";
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

  const doku = pingDoku();
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

  // Sandbox PayPal alongside live DOKU means a booking can be "paid" in test
  // money and still get a real ticket. That is worse than PayPal being off.
  const paypalTestModeOnLiveSite = paypal.mode === "sandbox" && isDokuLive();

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
          ? "sandbox — takes NO real money, but DOKU is live. Customers see a test-mode warning and PayPal bookings issue real tickets for nothing."
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
      label: "Client ID",
      ok: Boolean(doku.clientIdPrefix),
      detail: doku.clientIdPrefix || "not set",
    },
    {
      label: "Secret key",
      ok: doku.secretPresent,
      detail: doku.secretPresent
        ? "set"
        : "not set — requests cannot be signed",
    },
    { label: "Mode", ok: doku.mode === "live", detail: doku.mode === "mock" ? "mock (no keys set)" : `${doku.mode}${doku.override !== "ENV" ? ` (console override: ${doku.override})` : " (from DOKU_IS_PRODUCTION)"}` },
    {
      label: "Takes real payments",
      ok: isDokuLive(),
      detail: isDokuLive()
        ? "yes"
        : "no — checkout falls back to the dummy flow",
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
          <CardTitle>DOKU Checkout</CardTitle>
          <CardDescription>
            Both credentials are required: the client id identifies us, the
            secret signs every request and verifies every notification.
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
            Register this exact URL in the DOKU dashboard. DOKU signs the
            request path, so a mismatch here fails verification even with the
            right secret.
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
