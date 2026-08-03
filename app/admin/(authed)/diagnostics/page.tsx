import { requireSuperAdmin } from "@/lib/auth";
import { pingDoku, isDokuLive, NOTIFICATION_PATH } from "@/lib/doku";
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

  const doku = pingDoku();
  const notificationUrl = `${env.APP_BASE_URL}${NOTIFICATION_PATH}`;

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
    { label: "Mode", ok: doku.mode === "live", detail: doku.mode },
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
