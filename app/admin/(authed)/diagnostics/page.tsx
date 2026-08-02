import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pingMidtrans } from "@/lib/midtrans";
import { pingPaypal, isPaypalLive, paypalPresentmentCurrency } from "@/lib/paypal";
import { quoteForeignCharge, MAX_RATE_AGE_MS } from "@/lib/fx";
import { env } from "@/lib/env";
import { formatLocalDateTime } from "@/lib/datetime";
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
 * Read-only gateway status. Exists because "why is PayPal not showing at
 * checkout?" was otherwise only answerable by SSH-ing to the box and grepping
 * the env file — and the answer is frequently a stale FX rate rather than a
 * credential problem, which nothing surfaced.
 *
 * Never renders a secret. Only presence, mode, and key prefixes.
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

  const midtrans = pingMidtrans();
  const paypal = pingPaypal();

  // The same call the pay page makes, so this page fails exactly when checkout
  // would — rather than reporting a green light the customer never sees.
  const currency = paypalPresentmentCurrency();
  let fxDetail: string;
  let fxOk = false;
  try {
    const quote = await quoteForeignCharge(1_000_000, currency);
    fxOk = true;
    fxDetail = `1,000,000 IDR = ${quote.amount} ${quote.currency} · rate ${quote.rate} · quoted ${formatLocalDateTime(quote.quotedAt)} WITA`;
  } catch (err) {
    fxDetail = err instanceof Error ? err.message : String(err);
  }

  const latestFx = await prisma.fxRate.findFirst({
    where: { currency },
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true },
  });

  const midtransRows: Row[] = [
    {
      label: "Server key",
      ok: Boolean(midtrans.keyPrefix),
      detail: midtrans.keyPrefix || "not set",
    },
    {
      label: "Client key (Snap.js needs this)",
      ok: midtrans.clientKeyPresent,
      detail: midtrans.clientKeyPresent ? "set" : "not set — popup will not open",
    },
    { label: "Mode", ok: midtrans.mode === "live", detail: midtrans.mode },
  ];

  const paypalRows: Row[] = [
    {
      label: "Client ID / secret",
      ok: paypal.ok,
      detail: paypal.ok ? "set" : "not set",
    },
    {
      label: "Webhook ID",
      ok: paypal.webhookConfigured,
      detail: paypal.webhookConfigured
        ? "set"
        : "not set — webhooks are rejected",
    },
    { label: "Mode", ok: paypal.mode === "live", detail: paypal.mode },
    {
      label: `FX rate (${currency})`,
      ok: fxOk,
      detail: fxDetail,
    },
    {
      label: "Offered at checkout",
      ok: isPaypalLive() && fxOk,
      detail:
        isPaypalLive() && fxOk
          ? "yes"
          : !isPaypalLive()
            ? "no — credentials missing or mock"
            : "no — no usable FX rate",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          Read-only. Shows whether each integration can actually take money —
          no secrets are displayed.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Midtrans</CardTitle>
            <CardDescription>
              Domestic rails. Both keys are required — the server key signs the
              transaction, the client key opens Snap in the browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {midtransRows.map((r) => (
              <StatusRow key={r.label} row={r} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PayPal</CardTitle>
            <CardDescription>
              Foreign cards. PayPal cannot settle IDR, so it only appears when a
              rate fresher than {MAX_RATE_AGE_MS / 3_600_000}h exists to quote
              {" "}{currency} against.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {paypalRows.map((r) => (
              <StatusRow key={r.label} row={r} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>FX refresh</CardTitle>
          <CardDescription>
            Populated by the <span className="font-mono">refresh-fx</span> cron.
            On the droplet that is the <span className="font-mono">cron</span>{" "}
            service in docker-compose, which needs{" "}
            <span className="font-mono">CRON_SECRET</span> set or every call is
            rejected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusRow
            row={{
              label: `Last ${currency} rate stored`,
              ok: Boolean(latestFx),
              detail: latestFx
                ? `${formatLocalDateTime(latestFx.fetchedAt)} WITA`
                : "never — cron has not run successfully",
            }}
          />
          <StatusRow
            row={{
              label: "CRON_SECRET",
              ok: Boolean(env.CRON_SECRET),
              detail: env.CRON_SECRET ? "set" : "not set — cron routes 401",
            }}
          />
          <StatusRow
            row={{
              label: "Webhook base URL",
              ok: env.APP_BASE_URL.startsWith("https://"),
              detail: env.APP_BASE_URL.startsWith("https://")
                ? env.APP_BASE_URL
                : `${env.APP_BASE_URL} — live PayPal webhooks require HTTPS`,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
