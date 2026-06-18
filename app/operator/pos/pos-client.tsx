"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Counter } from "@/components/ui/counter";
import { formatIDR } from "@/lib/utils";
import { formatLocalTime } from "@/lib/datetime";

type LegOption = {
  id: string;
  route: string;
  boatName: string;
  departureTime: string;
  availableSeats: number;
  basePrice: number;
};

type PosScreen = "select" | "sell" | "success";

export function PosClient({ legs }: { legs: LegOption[] }) {
  const router = useRouter();
  const [screen, setScreen] = React.useState<PosScreen>("select");
  const [selectedLeg, setSelectedLeg] = React.useState<LegOption | null>(null);
  const [adults, setAdults] = React.useState(1);
  const [children, setChildren] = React.useState(0);
  const [infants, setInfants] = React.useState(0);
  const [paymentMethod, setPaymentMethod] = React.useState<"CASH" | "QRIS">("CASH");
  const [amountReceived, setAmountReceived] = React.useState(0);
  const [customerName, setCustomerName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{ ref: string } | null>(null);

  const totalPassengers = adults + children + infants;
  const totalPrice = selectedLeg
    ? selectedLeg.basePrice * adults + selectedLeg.basePrice * 0.5 * children
    : 0;
  const change = paymentMethod === "CASH" ? Math.max(0, amountReceived - totalPrice) : 0;

  function selectLeg(leg: LegOption) {
    setSelectedLeg(leg);
    setScreen("sell");
  }

  async function handlePay() {
    if (!selectedLeg || totalPassengers === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/operator/pos/sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legId: selectedLeg.id,
          adults,
          children,
          infants,
          paymentMethod,
          amountReceived: paymentMethod === "CASH" ? amountReceived : undefined,
          customerName,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({ ref: data.bookingReference });
        setScreen("success");
      }
    } catch (err) {
      console.error("[pos] sale failed:", err);
    } finally {
      setSubmitting(false);
    }
  }

  if (screen === "select") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-mekari-neutral-900">Pilih Jadwal</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {legs.map((leg) => (
            <Card key={leg.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => selectLeg(leg)}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold">{leg.route}</p>
                    <p className="text-sm text-mekari-neutral-500">
                      {leg.boatName} · <span className="font-mono">{leg.departureTime}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{leg.availableSeats} kursi</p>
                    <p className="text-xs text-mekari-neutral-500">{formatIDR(leg.basePrice)}/pax</p>
                  </div>
                </div>
                <Button className="mt-3 w-full bg-mekari-primary hover:bg-mekari-primary-600" size="sm">
                  Pilih
                </Button>
              </CardContent>
            </Card>
          ))}
          {legs.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-mekari-neutral-500">
              Tidak ada jadwal tersedia untuk 8 jam ke depan.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (screen === "sell" && selectedLeg) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Penjualan Tiket</CardTitle>
            <p className="text-sm text-mekari-neutral-500">
              {selectedLeg.route} · {selectedLeg.boatName} · <span className="font-mono">{selectedLeg.departureTime}</span>
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Dewasa</Label>
                <Counter id="adults" value={adults} onChange={setAdults} min={0} max={20} />
              </div>
              <div>
                <Label>Anak</Label>
                <Counter id="children" value={children} onChange={setChildren} min={0} max={10} />
              </div>
              <div>
                <Label>Bayi</Label>
                <Counter id="infants" value={infants} onChange={setInfants} min={0} max={5} />
              </div>
            </div>
            <div>
              <Label>Nama Pelanggan (opsional)</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nama pemesan" />
            </div>
            <div>
              <Label>Metode Bayar</Label>
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  variant={paymentMethod === "CASH" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPaymentMethod("CASH")}
                  className={paymentMethod === "CASH" ? "bg-mekari-primary" : ""}
                >
                  Tunai
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === "QRIS" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPaymentMethod("QRIS")}
                  className={paymentMethod === "QRIS" ? "bg-mekari-primary" : ""}
                >
                  QRIS
                </Button>
              </div>
            </div>
            {paymentMethod === "CASH" && (
              <div>
                <Label>Jumlah Diterima</Label>
                <MoneyInput value={amountReceived} onChange={setAmountReceived} />
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => { setScreen("select"); setSelectedLeg(null); }}>
              ← Kembali
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ringkasan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-mekari-neutral-500">{adults} Dewasa × {formatIDR(selectedLeg.basePrice)}</span>
              <span className="tabular-nums">{formatIDR(selectedLeg.basePrice * adults)}</span>
            </div>
            {children > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-mekari-neutral-500">{children} Anak × {formatIDR(selectedLeg.basePrice * 0.5)}</span>
                <span className="tabular-nums">{formatIDR(selectedLeg.basePrice * 0.5 * children)}</span>
              </div>
            )}
            {infants > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-mekari-neutral-500">{infants} Bayi (gratis)</span>
                <span className="tabular-nums">Rp 0</span>
              </div>
            )}
            <div className="border-t border-mekari-neutral-200 pt-3">
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatIDR(totalPrice)}</span>
              </div>
            </div>
            {paymentMethod === "CASH" && amountReceived > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-mekari-neutral-500">Kembalian</span>
                <span className="font-semibold tabular-nums text-mekari-success">{formatIDR(change)}</span>
              </div>
            )}
            <Button
              className="w-full bg-mekari-primary hover:bg-mekari-primary-600"
              size="lg"
              onClick={handlePay}
              disabled={submitting || totalPassengers === 0 || (paymentMethod === "CASH" && amountReceived < totalPrice)}
            >
              {submitting ? "Memproses…" : `Bayar ${formatIDR(totalPrice)}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (screen === "success" && result) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <svg className="h-8 w-8 text-mekari-success" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-mekari-neutral-900">Tiket Berhasil</h2>
        <p className="mt-2 text-sm text-mekari-neutral-500">
          Ref. Booking: <span className="font-mono font-medium">{result.ref}</span>
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => window.print()}>
            Cetak Struk
          </Button>
          <Button
            className="bg-mekari-primary hover:bg-mekari-primary-600"
            onClick={() => {
              setScreen("select");
              setSelectedLeg(null);
              setAdults(1);
              setChildren(0);
              setInfants(0);
              setAmountReceived(0);
              setCustomerName("");
              setResult(null);
            }}
          >
            Kembali ke Jadwal
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
