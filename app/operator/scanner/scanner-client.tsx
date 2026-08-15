"use client";

import * as React from "react";
import { QrScanner } from "@/components/operator/qr-scanner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn, formatDateTimeID } from "@/lib/utils";
import type { CheckinResult } from "../../api/operator/checkin/route";

type LegOption = {
  id: string;
  label: string;
  boat: string;
  departureDate: string;
  status: string;
};

type Outcome = {
  at: number;
  result: CheckinResult;
};

export function ScannerClient({
  options,
  initialLegId,
}: {
  options: LegOption[];
  initialLegId?: string;
}) {
  const [legId, setLegId] = React.useState<string>(
    initialLegId && options.some((o) => o.id === initialLegId)
      ? initialLegId
      : options[0]?.id ?? "",
  );
  const [active, setActive] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const inFlightRef = React.useRef<string | null>(null);

  const handleDetected = React.useCallback(
    async (qrPayload: string) => {
      if (!legId) return;
      // Coalesce: don't fire a second request while one is in flight for
      // the same payload.
      if (inFlightRef.current === qrPayload) return;
      inFlightRef.current = qrPayload;
      setSubmitting(true);
      try {
        const res = await fetch("/api/operator/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrPayload, legId }),
        });
        const result = (await res.json()) as CheckinResult;
        setOutcome({ at: Date.now(), result });
      } catch (err) {
        setOutcome({
          at: Date.now(),
          result: {
            ok: false,
            reason: "INVALID_INPUT",
            message:
              err instanceof Error
                ? err.message
                : "Network error — try again.",
          },
        });
      } finally {
        setSubmitting(false);
        // Release the inflight lock after a short window so re-scans of the
        // same code after a stop-and-go work.
        setTimeout(() => {
          if (inFlightRef.current === qrPayload) inFlightRef.current = null;
        }, 1500);
      }
    },
    [legId],
  );

  const selectedLeg = options.find((o) => o.id === legId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Boarding scanner</h1>
        <p className="text-sm text-muted-foreground">
          Select the departure you&apos;re boarding, then point the camera at
          each passenger&apos;s QR code.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Pick the departure</CardTitle>
          <CardDescription>
            Showing departures from the last hour through the next 3 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {options.length === 0 ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No departures in the scan window. Generate departures from a
              schedule first.
            </p>
          ) : (
            <>
              <Label htmlFor="legId">Departure</Label>
              <select
                id="legId"
                value={legId}
                onChange={(e) => {
                  setLegId(e.target.value);
                  setOutcome(null);
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {formatDateTimeID(o.departureDate)} · {o.label} · {o.boat}
                  </option>
                ))}
              </select>
              {selectedLeg ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge
                    variant={
                      selectedLeg.status === "CANCELLED"
                        ? "destructive"
                        : selectedLeg.status === "SAILED"
                          ? "secondary"
                          : "success"
                    }
                  >
                    {selectedLeg.status}
                  </Badge>
                  <span>{selectedLeg.boat}</span>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Scan</CardTitle>
          <CardDescription>
            Camera access requires HTTPS in production. On localhost it works
            on plain HTTP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!active ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!legId}
              onClick={() => {
                setOutcome(null);
                setActive(true);
              }}
            >
              Start scanner
            </Button>
          ) : (
            <>
              <QrScanner onDetected={handleDetected} paused={false} />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setActive(false)}
              >
                Stop scanner
              </Button>
            </>
          )}

          {submitting ? (
            <p className="text-center text-xs text-muted-foreground">
              Validating…
            </p>
          ) : null}

          {outcome ? <OutcomeBanner outcome={outcome} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OutcomeBanner({ outcome }: { outcome: Outcome }) {
  const { result } = outcome;
  if (result.ok) {
    return (
      <div
        className={cn(
          "rounded-md border bg-emerald-50 p-4 text-sm",
          "border-emerald-200 text-emerald-900",
        )}
      >
        <div className="text-base font-semibold">✓ Boarded</div>
        <div className="mt-1">{result.ticket.passengerName}</div>
        <div className="font-mono text-xs text-emerald-700">
          {result.ticket.ticketCode} · {result.ticket.bookingReference}
        </div>
      </div>
    );
  }
  const tone =
    result.reason === "ALREADY_CHECKED_IN"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : result.reason === "WRONG_LEG"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-red-200 bg-red-50 text-red-900";
  const heading =
    result.reason === "ALREADY_CHECKED_IN"
      ? "Already checked in"
      : result.reason === "WRONG_LEG"
        ? "Wrong departure"
        : result.reason === "INVALID_QR"
          ? "Invalid QR"
          : result.reason === "REFUNDED"
            ? "Ticket refunded"
            : result.reason === "TICKET_NOT_FOUND"
              ? "Ticket not found"
              : result.reason === "WRONG_OPERATOR"
                ? "Wrong operator"
                : result.reason === "LEG_NOT_ACTIVE"
                  ? "Departure not active"
                  : "Error";
  return (
    <div className={cn("rounded-md border p-4 text-sm", tone)}>
      <div className="text-base font-semibold">✗ {heading}</div>
      <div className="mt-1">{result.message}</div>
    </div>
  );
}
