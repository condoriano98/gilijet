"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Clock,
  Users,
  Snowflake,
  LifeBuoy,
  Wifi,
  Coffee,
  Wind,
  ChevronDown,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatIDR } from "@/lib/utils";

type Amenity = "ac" | "lifeJacket" | "wifi" | "snacks" | "openDeck";

type Boat = {
  id: string;
  operator: string;
  logo: string;
  vessel: "Fast Boat" | "Speedboat" | "Ferry";
  departure: string;
  arrival: string;
  durationMin: number;
  price: number;
  seatsLeft: number;
  amenities: Amenity[];
  rating: number;
  reviewCount: number;
};

const BOATS: Boat[] = [
  {
    id: "b1",
    operator: "Gili Getaway Express",
    logo: "GG",
    vessel: "Fast Boat",
    departure: "07:30",
    arrival: "09:45",
    durationMin: 135,
    price: 425000,
    seatsLeft: 6,
    amenities: ["ac", "lifeJacket", "snacks", "wifi"],
    rating: 4.7,
    reviewCount: 1280,
  },
  {
    id: "b2",
    operator: "Blue Water Fast Boat",
    logo: "BW",
    vessel: "Fast Boat",
    departure: "08:15",
    arrival: "10:35",
    durationMin: 140,
    price: 295000,
    seatsLeft: 12,
    amenities: ["ac", "lifeJacket", "openDeck"],
    rating: 4.5,
    reviewCount: 942,
  },
  {
    id: "b3",
    operator: "Eka Jaya",
    logo: "EJ",
    vessel: "Fast Boat",
    departure: "09:00",
    arrival: "11:30",
    durationMin: 150,
    price: 350000,
    seatsLeft: 3,
    amenities: ["ac", "lifeJacket", "snacks"],
    rating: 4.6,
    reviewCount: 2104,
  },
  {
    id: "b4",
    operator: "Wahana Gili Ocean",
    logo: "WG",
    vessel: "Fast Boat",
    departure: "10:30",
    arrival: "12:50",
    durationMin: 140,
    price: 315000,
    seatsLeft: 18,
    amenities: ["ac", "lifeJacket", "wifi"],
    rating: 4.4,
    reviewCount: 671,
  },
  {
    id: "b5",
    operator: "Scoot Fast Cruises",
    logo: "SC",
    vessel: "Speedboat",
    departure: "11:00",
    arrival: "12:50",
    durationMin: 110,
    price: 525000,
    seatsLeft: 4,
    amenities: ["ac", "lifeJacket", "snacks", "wifi"],
    rating: 4.8,
    reviewCount: 3210,
  },
  {
    id: "b6",
    operator: "Lombok Shuttle Ferry",
    logo: "LS",
    vessel: "Ferry",
    departure: "13:00",
    arrival: "16:30",
    durationMin: 210,
    price: 165000,
    seatsLeft: 42,
    amenities: ["lifeJacket", "openDeck", "snacks"],
    rating: 4.0,
    reviewCount: 558,
  },
  {
    id: "b7",
    operator: "Gili Getaway Express",
    logo: "GG",
    vessel: "Fast Boat",
    departure: "14:30",
    arrival: "16:45",
    durationMin: 135,
    price: 425000,
    seatsLeft: 9,
    amenities: ["ac", "lifeJacket", "snacks", "wifi"],
    rating: 4.7,
    reviewCount: 1280,
  },
  {
    id: "b8",
    operator: "Blue Water Fast Boat",
    logo: "BW",
    vessel: "Fast Boat",
    departure: "15:45",
    arrival: "18:00",
    durationMin: 135,
    price: 295000,
    seatsLeft: 22,
    amenities: ["ac", "lifeJacket", "openDeck"],
    rating: 4.5,
    reviewCount: 942,
  },
  {
    id: "b9",
    operator: "Eka Jaya",
    logo: "EJ",
    vessel: "Fast Boat",
    departure: "17:00",
    arrival: "19:30",
    durationMin: 150,
    price: 365000,
    seatsLeft: 7,
    amenities: ["ac", "lifeJacket", "snacks"],
    rating: 4.6,
    reviewCount: 2104,
  },
  {
    id: "b10",
    operator: "Lombok Shuttle Ferry",
    logo: "LS",
    vessel: "Ferry",
    departure: "19:30",
    arrival: "23:00",
    durationMin: 210,
    price: 145000,
    seatsLeft: 64,
    amenities: ["lifeJacket", "openDeck"],
    rating: 4.0,
    reviewCount: 558,
  },
];

const ALL_OPERATORS = Array.from(new Set(BOATS.map((b) => b.operator))).sort();
const ALL_VESSELS: Boat["vessel"][] = ["Fast Boat", "Speedboat", "Ferry"];

type TimeBucket = "morning" | "afternoon" | "evening" | "night";
const TIME_BUCKETS: { id: TimeBucket; label: string; range: string }[] = [
  { id: "morning", label: "Morning", range: "05:00 – 11:00" },
  { id: "afternoon", label: "Afternoon", range: "11:00 – 17:00" },
  { id: "evening", label: "Evening", range: "17:00 – 23:00" },
  { id: "night", label: "Night", range: "23:00 – 05:00" },
];

function bucketOf(time: string): TimeBucket {
  const h = Number(time.slice(0, 2));
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "afternoon";
  if (h >= 17 && h < 23) return "evening";
  return "night";
}

const AMENITY_META: Record<
  Amenity,
  { label: string; icon: typeof Snowflake }
> = {
  ac: { label: "AC", icon: Snowflake },
  lifeJacket: { label: "Life jacket", icon: LifeBuoy },
  wifi: { label: "WiFi", icon: Wifi },
  snacks: { label: "Snacks", icon: Coffee },
  openDeck: { label: "Open deck", icon: Wind },
};

type SortKey = "cheapest" | "fastest" | "earliest" | "rating";

export default function HomePage() {
  const minPrice = Math.min(...BOATS.map((b) => b.price));
  const maxPrice = Math.max(...BOATS.map((b) => b.price));

  const [priceMin, setPriceMin] = useState(minPrice);
  const [priceMax, setPriceMax] = useState(maxPrice);
  const [buckets, setBuckets] = useState<Set<TimeBucket>>(new Set());
  const [vessels, setVessels] = useState<Set<Boat["vessel"]>>(new Set());
  const [operators, setOperators] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("cheapest");

  const filtered = useMemo(() => {
    let xs = BOATS.filter((b) => b.price >= priceMin && b.price <= priceMax);
    if (buckets.size) xs = xs.filter((b) => buckets.has(bucketOf(b.departure)));
    if (vessels.size) xs = xs.filter((b) => vessels.has(b.vessel));
    if (operators.size) xs = xs.filter((b) => operators.has(b.operator));

    const sorted = [...xs];
    sorted.sort((a, b) => {
      if (sort === "cheapest") return a.price - b.price;
      if (sort === "fastest") return a.durationMin - b.durationMin;
      if (sort === "earliest") return a.departure.localeCompare(b.departure);
      return b.rating - a.rating;
    });
    return sorted;
  }, [priceMin, priceMax, buckets, vessels, operators, sort]);

  function toggle<T>(set: Set<T>, value: T, setter: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  function resetAll() {
    setPriceMin(minPrice);
    setPriceMax(maxPrice);
    setBuckets(new Set());
    setVessels(new Set());
    setOperators(new Set());
  }

  return (
    <div className="bg-slate-50">
      <header className="border-b bg-white">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Route
            </div>
            <div className="text-lg font-semibold text-slate-900">
              Bali (Padang Bai) → Gili Trawangan
            </div>
            <div className="text-xs text-slate-600">
              Sat, 24 May 2026 · 2 passengers
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/b">Find my booking</Link>
          </Button>
        </div>
      </header>

      <div className="container grid gap-6 py-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Filter</h2>
            <button
              type="button"
              onClick={resetAll}
              className="text-xs font-medium text-sky-700 hover:underline"
            >
              Reset all
            </button>
          </div>

          <FilterSection title="Price">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="pmin" className="text-xs">
                  Min (IDR)
                </Label>
                <Input
                  id="pmin"
                  type="number"
                  value={priceMin}
                  onChange={(e) => setPriceMin(Number(e.target.value || 0))}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="pmax" className="text-xs">
                  Max (IDR)
                </Label>
                <Input
                  id="pmax"
                  type="number"
                  value={priceMax}
                  onChange={(e) => setPriceMax(Number(e.target.value || 0))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {formatIDR(priceMin)} – {formatIDR(priceMax)}
            </div>
          </FilterSection>

          <FilterSection title="Departure time">
            <ul className="space-y-2">
              {TIME_BUCKETS.map((b) => (
                <li key={b.id} className="flex items-start gap-2">
                  <Checkbox
                    id={`tb-${b.id}`}
                    checked={buckets.has(b.id)}
                    onCheckedChange={() =>
                      toggle(buckets, b.id, setBuckets)
                    }
                  />
                  <Label
                    htmlFor={`tb-${b.id}`}
                    className="cursor-pointer text-sm"
                  >
                    <div>{b.label}</div>
                    <div className="text-xs text-slate-500">{b.range}</div>
                  </Label>
                </li>
              ))}
            </ul>
          </FilterSection>

          <FilterSection title="Boat type">
            <ul className="space-y-2">
              {ALL_VESSELS.map((v) => (
                <li key={v} className="flex items-center gap-2">
                  <Checkbox
                    id={`v-${v}`}
                    checked={vessels.has(v)}
                    onCheckedChange={() => toggle(vessels, v, setVessels)}
                  />
                  <Label htmlFor={`v-${v}`} className="cursor-pointer text-sm">
                    {v}
                  </Label>
                </li>
              ))}
            </ul>
          </FilterSection>

          <FilterSection title="Operator">
            <ul className="space-y-2">
              {ALL_OPERATORS.map((op) => (
                <li key={op} className="flex items-center gap-2">
                  <Checkbox
                    id={`op-${op}`}
                    checked={operators.has(op)}
                    onCheckedChange={() => toggle(operators, op, setOperators)}
                  />
                  <Label htmlFor={`op-${op}`} className="cursor-pointer text-sm">
                    {op}
                  </Label>
                </li>
              ))}
            </ul>
          </FilterSection>
        </aside>

        <main>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">
                {filtered.length}
              </span>{" "}
              of {BOATS.length} boats
            </div>
            <SortTabs sort={sort} onChange={setSort} />
          </div>

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-slate-500">
                No boats match these filters. Try widening the price range or
                clearing some options.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((boat) => (
                <BoatCard key={boat.id} boat={boat} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-slate-500 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function SortTabs({
  sort,
  onChange,
}: {
  sort: SortKey;
  onChange: (s: SortKey) => void;
}) {
  const tabs: { id: SortKey; label: string }[] = [
    { id: "cheapest", label: "Cheapest" },
    { id: "fastest", label: "Fastest" },
    { id: "earliest", label: "Earliest" },
    { id: "rating", label: "Top rated" },
  ];
  return (
    <div className="flex rounded-lg border bg-white p-1 text-sm">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={[
            "px-3 py-1.5 rounded-md font-medium transition-colors",
            sort === t.id
              ? "bg-sky-600 text-white"
              : "text-slate-600 hover:text-slate-900",
          ].join(" ")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function BoatCard({ boat }: { boat: Boat }) {
  const lowSeats = boat.seatsLeft <= 5;
  const hours = Math.floor(boat.durationMin / 60);
  const mins = boat.durationMin % 60;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-100 text-sm font-bold text-sky-700">
              {boat.logo}
            </div>
            <div>
              <CardTitle className="text-base">{boat.operator}</CardTitle>
              <div className="text-xs text-slate-500">
                {boat.vessel} · ★ {boat.rating.toFixed(1)} (
                {boat.reviewCount.toLocaleString()})
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-slate-900">
              {formatIDR(boat.price)}
            </div>
            <div className="text-xs text-slate-500">per passenger</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <div className="text-lg font-semibold text-slate-900">
              {boat.departure}
            </div>
            <div className="text-xs text-slate-500">Padang Bai</div>
          </div>
          <div className="flex flex-1 items-center gap-2 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            {hours}h {mins ? `${mins}m` : ""}
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-900">
              {boat.arrival}
            </div>
            <div className="text-xs text-slate-500">Gili Trawangan</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {boat.amenities.map((a) => {
            const meta = AMENITY_META[a];
            const Icon = meta.icon;
            return (
              <span
                key={a}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
              >
                <Icon className="h-3 w-3" />
                {meta.label}
              </span>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="flex items-center gap-2 text-xs">
            <Users className="h-3.5 w-3.5 text-slate-500" />
            {lowSeats ? (
              <Badge variant="warning">Only {boat.seatsLeft} seats left</Badge>
            ) : (
              <span className="text-slate-600">
                {boat.seatsLeft} seats available
              </span>
            )}
          </div>
          <Button size="sm">Select</Button>
        </div>
      </CardContent>
    </Card>
  );
}
