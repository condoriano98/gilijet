"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Check, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DUMMY_BOATS = [
  {
    id: "1",
    company: "Gili Getaway Express",
    logo: "GG",
    departure: "08:00",
    arrival: "10:30",
    duration: "2h 30m",
    price: 375000,
    seats: 8,
    vessel: "Fast Boat",
  },
  {
    id: "2",
    company: "Blue Water Fast Boat",
    logo: "BW",
    departure: "09:30",
    arrival: "12:00",
    duration: "2h 30m",
    price: 295000,
    seats: 12,
    vessel: "Fast Boat",
  },
  {
    id: "3",
    company: "Lombok Shuttle Ferry",
    logo: "LS",
    departure: "11:00",
    arrival: "14:15",
    duration: "3h 15m",
    price: 195000,
    seats: 25,
    vessel: "Ferry",
  },
];

const PAYMENT_METHODS = [
  { id: "qris", label: "QRIS", icon: "📱", desc: "Instant transfer" },
  { id: "gopay", label: "GoPay", icon: "🏪", desc: "Tap & pay" },
  { id: "ovo", label: "OVO", icon: "⭐", desc: "Digital wallet" },
  { id: "bca", label: "BCA Virtual", icon: "🏦", desc: "Bank transfer" },
  { id: "card", label: "Visa/MC", icon: "💳", desc: "Credit card" },
];

function StepIndicator({ current }: { current: number }) {
  const steps = ["Boat", "Passengers", "Contact", "Review", "Payment", "Done"];
  return (
    <div className="mb-6">
      <ol className="flex items-center gap-1 sm:gap-2">
        {steps.map((label, idx) => {
          const num = idx + 1;
          const done = num < current;
          const active = num === current;
          return (
            <li key={label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors sm:h-9 sm:w-9 sm:text-sm",
                    done
                      ? "bg-sky-600 text-white"
                      : active
                        ? "bg-sky-600 text-white ring-4 ring-sky-100"
                        : "border-2 border-slate-300 text-slate-400",
                  ].join(" ")}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={3} /> : num}
                </div>
                <span
                  className={[
                    "mt-1 hidden text-xs sm:block",
                    active ? "font-semibold text-sky-700" : done ? "text-slate-500" : "text-slate-400",
                  ].join(" ")}
                >
                  {label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className={["mx-1 h-0.5 flex-1", num < current ? "bg-sky-600" : "bg-slate-200"].join(" ")} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function BoatSelectionStep({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Select a departure</h2>
      <p className="text-sm text-slate-600">Gili Trawangan → Padang Bai, Bali</p>
      {DUMMY_BOATS.map((boat) => (
        <Card
          key={boat.id}
          className={[
            "cursor-pointer transition-all",
            selectedId === boat.id ? "border-sky-500 bg-sky-50" : "hover:shadow-md",
          ].join(" ")}
          onClick={() => onSelect(boat.id)}
        >
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-700">
                {boat.logo}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-slate-900">{boat.company}</div>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                  <span className="font-mono text-base font-bold">{boat.departure}</span>
                  <span>→</span>
                  <span className="font-mono text-base font-bold">{boat.arrival}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {boat.duration} · {boat.vessel}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-slate-900">IDR {boat.price.toLocaleString("id-ID")}</div>
                <Badge variant="outline" className="mt-1 text-xs">
                  {boat.seats} seats left
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PassengerStep({
  count,
  passengers,
  onChange,
}: {
  count: number;
  passengers: Array<{ name: string; nationality: string }>;
  onChange: (passengers: Array<{ name: string; nationality: string }>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">How many passengers?</h2>
        <p className="text-sm text-slate-600 mt-1">You selected {count} passenger{count !== 1 ? "s" : ""}</p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const newPassengers = passengers.slice(0, Math.max(1, count - 1));
            onChange(newPassengers);
          }}
          disabled={count === 1}
        >
          − Remove
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const newPassengers = [...passengers];
            if (newPassengers.length < 10) {
              newPassengers.push({ name: "", nationality: "Indonesia" });
            }
            onChange(newPassengers);
          }}
          disabled={count >= 10}
        >
          + Add
        </Button>
      </div>

      <div className="space-y-3 mt-4">
        {passengers.map((passenger, idx) => (
          <Card key={idx}>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Passenger {idx + 1} Name</Label>
                  <Input
                    placeholder="Full name"
                    value={passenger.name}
                    onChange={(e) => {
                      const newPassengers = [...passengers];
                      newPassengers[idx].name = e.target.value;
                      onChange(newPassengers);
                    }}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Nationality</Label>
                  <select
                    value={passenger.nationality}
                    onChange={(e) => {
                      const newPassengers = [...passengers];
                      newPassengers[idx].nationality = e.target.value;
                      onChange(newPassengers);
                    }}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option>Indonesia</option>
                    <option>Malaysia</option>
                    <option>Singapore</option>
                    <option>Australia</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

type ContactInfo = { name: string; email: string; phone: string };

function ContactStep({
  contact,
  onChange,
}: {
  contact: ContactInfo;
  onChange: (contact: ContactInfo) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Your contact details</h2>
      <p className="text-sm text-slate-600">We&apos;ll send your e-ticket to this email</p>

      <div className="space-y-3">
        <div>
          <Label htmlFor="name" className="text-sm">
            Full Name
          </Label>
          <Input
            id="name"
            placeholder="Your name"
            value={contact.name}
            onChange={(e) => onChange({ ...contact, name: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="email" className="text-sm">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={contact.email}
            onChange={(e) => onChange({ ...contact, email: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="phone" className="text-sm">
            Phone (WhatsApp)
          </Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+62 812 3456 7890"
            value={contact.phone}
            onChange={(e) => onChange({ ...contact, phone: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  boat,
  passengers,
  contact,
  agreed,
  onAgreeChange,
}: {
  boat: (typeof DUMMY_BOATS)[0] | null;
  passengers: Array<{ name: string; nationality: string }>;
  contact: { name: string; email: string; phone: string };
  agreed: boolean;
  onAgreeChange: (v: boolean) => void;
}) {
  const totalPrice = (boat?.price ?? 0) * passengers.length;
  const platformFee = Math.round(totalPrice * 0.08);
  const grandTotal = totalPrice + platformFee;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Review your booking</h2>

      {boat && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Trip Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Route</span>
              <span className="font-medium">Gili Trawangan → Padang Bai</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Departure</span>
              <span className="font-mono font-medium">{boat.departure}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Boat</span>
              <span className="font-medium">{boat.company}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Passengers</span>
              <span className="font-medium">{passengers.length}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Passengers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {passengers.map((p, idx) => (
              <div key={idx} className="flex justify-between py-1">
                <span>{p.name || `Passenger ${idx + 1}`}</span>
                <span className="text-slate-500">{p.nationality}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Price Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Base price × {passengers.length} passengers</span>
            <span className="font-medium">IDR {totalPrice.toLocaleString("id-ID")}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span>Platform fee (8%)</span>
            <span className="font-medium">IDR {platformFee.toLocaleString("id-ID")}</span>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-bold">
            <span>Total</span>
            <span>IDR {grandTotal.toLocaleString("id-ID")}</span>
          </div>
        </CardContent>
      </Card>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => onAgreeChange(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span className="text-xs text-slate-600">
          I agree to the refund policy: more than 7 days before departure, 100% refund · 48 hours–7 days, 50% · less than 48 hours, no refund.
        </span>
      </label>
    </div>
  );
}

function PaymentStep({
  selectedMethod,
  onSelect,
  total,
}: {
  selectedMethod: string | null;
  onSelect: (id: string) => void;
  total: number;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Choose payment method</h2>
      <p className="text-sm text-slate-600">Amount due: IDR {total.toLocaleString("id-ID")}</p>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
        {PAYMENT_METHODS.map((method) => (
          <Card
            key={method.id}
            className={[
              "cursor-pointer transition-all",
              selectedMethod === method.id ? "border-sky-500 bg-sky-50" : "hover:shadow-md",
            ].join(" ")}
            onClick={() => onSelect(method.id)}
          >
            <CardContent className="pt-4 text-center">
              <div className="text-3xl mb-2">{method.icon}</div>
              <div className="text-sm font-semibold text-slate-900">{method.label}</div>
              <div className="text-xs text-slate-500">{method.desc}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ConfirmationStep({ bookingRef }: { bookingRef: string }) {
  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center mb-4">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="h-8 w-8 text-green-600" strokeWidth={3} />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-slate-900">Booking confirmed!</h2>
      <p className="text-slate-600">Your e-tickets have been sent to your email.</p>

      <Card className="mt-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Booking Reference</p>
              <p className="font-mono text-lg font-bold text-sky-700">{bookingRef}</p>
            </div>

            <div className="flex justify-center">
              <div className="h-40 w-40 bg-slate-100 rounded-lg flex items-center justify-center border-2 border-dashed border-slate-300">
                <QrCode className="h-16 w-16 text-slate-400" />
              </div>
            </div>

            <p className="text-xs text-slate-500">Show this QR code at the dock</p>

            <Button className="w-full mt-4">Download E-Ticket</Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 pt-6 border-t">
        <p className="text-sm text-slate-600 mb-3">This is a demo. Go back to the real booking flow:</p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">← Back to home</Link>
        </Button>
      </div>
    </div>
  );
}

export default function BookingDemoPage() {
  const [step, setStep] = useState(1);
  const [selectedBoat, setSelectedBoat] = useState<string | null>(null);
  const [passengerCount, setPassengerCount] = useState(1);
  const [passengers, setPassengers] = useState([{ name: "", nationality: "Indonesia" }]);
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [agreed, setAgreed] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingRef, setBookingRef] = useState("");

  const boat = DUMMY_BOATS.find((b) => b.id === selectedBoat) || null;
  const totalPrice = (boat?.price ?? 0) * passengers.length;
  const platformFee = Math.round(totalPrice * 0.08);
  const grandTotal = totalPrice + platformFee;

  const canContinue = () => {
    switch (step) {
      case 1:
        return !!selectedBoat;
      case 2:
        return passengers.length > 0 && passengers.every((p) => p.name.trim().length > 0);
      case 3:
        return contact.name.trim().length > 0 && contact.email.includes("@") && contact.phone.length >= 6;
      case 4:
        return agreed;
      case 5:
        return !!selectedPayment;
      default:
        return false;
    }
  };

  const handleContinue = async () => {
    if (step === 5) {
      setIsProcessing(true);
      await new Promise((r) => setTimeout(r, 1500));
      const ref = `BK-DEMO-2026-05-${Math.random().toString().slice(2, 8).padStart(6, "0")}`;
      setBookingRef(ref);
      setIsProcessing(false);
      setStep(6);
    } else {
      setStep(step + 1);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white py-8">
      <div className="container max-w-2xl">
        <StepIndicator current={step} />

        <Card>
          <CardContent className="pt-6">
            {step === 1 && <BoatSelectionStep selectedId={selectedBoat} onSelect={setSelectedBoat} />}
            {step === 2 && (
              <PassengerStep count={passengers.length} passengers={passengers} onChange={setPassengers} />
            )}
            {step === 3 && <ContactStep contact={contact} onChange={setContact} />}
            {step === 4 && (
              <ReviewStep
                boat={boat}
                passengers={passengers}
                contact={contact}
                agreed={agreed}
                onAgreeChange={setAgreed}
              />
            )}
            {step === 5 && <PaymentStep selectedMethod={selectedPayment} onSelect={setSelectedPayment} total={grandTotal} />}
            {step === 6 && <ConfirmationStep bookingRef={bookingRef} />}
          </CardContent>
        </Card>

        {step < 6 && (
          <div className="mt-6 flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
              className="flex-1"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button
              onClick={handleContinue}
              disabled={!canContinue() || isProcessing}
              className="flex-1"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <div className="h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {step === 5 ? "Confirm payment" : "Continue"} <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
