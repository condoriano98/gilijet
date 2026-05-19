import Link from "next/link";
import { prisma } from "@/lib/db";
import { SearchForm } from "@/components/customer/search-form";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

// Fallback ports if the DB is empty so the landing page always renders
// with usable dropdowns. Real ports merge in on top of these.
const SEED_ORIGINS = [
  "Sanur",
  "Padang Bai",
  "Bangsal",
  "Nusa Penida",
  "Nusa Lembongan",
  "Gili Trawangan",
  "Lombok",
  "Labuan Bajo",
];
const SEED_DESTINATIONS = SEED_ORIGINS;

const POPULAR_ROUTES = [
  { from: "Sanur", to: "Nusa Penida", price: 250000, duration: "45m", image: "🏝️" },
  { from: "Padang Bai", to: "Gili Trawangan", price: 425000, duration: "2h 30m", image: "🌴" },
  { from: "Sanur", to: "Nusa Lembongan", price: 200000, duration: "35m", image: "⛵" },
  { from: "Padang Bai", to: "Lombok", price: 395000, duration: "3h", image: "🌊" },
  { from: "Bangsal", to: "Gili Trawangan", price: 85000, duration: "25m", image: "🚤" },
  { from: "Labuan Bajo", to: "Komodo", price: 750000, duration: "3h", image: "🦎" },
];

const FEATURED_DESTINATIONS = [
  {
    name: "Gili Islands",
    description: "Crystal water, no cars, perfect snorkeling",
    routes: 12,
    from: 85000,
  },
  {
    name: "Nusa Penida",
    description: "Dramatic cliffs and Kelingking beach",
    routes: 8,
    from: 200000,
  },
  {
    name: "Lombok",
    description: "Mount Rinjani and pink-sand beaches",
    routes: 6,
    from: 395000,
  },
  {
    name: "Komodo",
    description: "Dragons, pink beach, and Padar viewpoint",
    routes: 4,
    from: 750000,
  },
];

const TRUST_BADGES = [
  { title: "Best Price Guaranteed", desc: "No hidden fees, transparent pricing" },
  { title: "24/7 Customer Support", desc: "WhatsApp +62 812 3456 7890" },
  { title: "Instant E-Ticket", desc: "QR code delivered to your email" },
  { title: "Secure Payment", desc: "Powered by Xendit, BI licensed" },
];

export default async function HomePage() {
  let origins: string[] = SEED_ORIGINS;
  let destinations: string[] = SEED_DESTINATIONS;
  try {
    const schedules = await prisma.schedule.findMany({
      where: { status: "ACTIVE", boat: { status: "ACTIVE" } },
      select: { originPort: true, destinationPort: true },
    });
    const dbOrigins = schedules.map((s) => s.originPort);
    const dbDestinations = schedules.map((s) => s.destinationPort);
    if (dbOrigins.length > 0) {
      origins = Array.from(new Set([...SEED_ORIGINS, ...dbOrigins])).sort();
      destinations = Array.from(
        new Set([...SEED_DESTINATIONS, ...dbDestinations]),
      ).sort();
    }
  } catch (err) {
    console.error("[home] failed to load schedules — using seed list", err);
  }

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-500 pb-24 pt-12 sm:pt-16">
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 50%, white 0%, transparent 50%), radial-gradient(circle at 80% 80%, white 0%, transparent 50%)",
            }}
          />
        </div>
        <div className="container relative">
          <div className="mx-auto max-w-3xl text-center text-white">
            <Badge className="bg-white/20 text-white hover:bg-white/30">
              Indonesia's #1 boat ticketing platform
            </Badge>
            <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Island-hop with confidence
            </h1>
            <p className="mt-4 text-lg text-sky-50 sm:text-xl">
              Book verified fast boats and ferries across Indonesia.
              <br className="hidden sm:inline" />
              Pay your way, get e-tickets instantly.
            </p>
          </div>

          {/* Search bar */}
          <div className="mx-auto mt-8 max-w-5xl">
            <div className="rounded-2xl bg-white p-2 shadow-2xl">
              <SearchForm origins={origins} destinations={destinations} />
            </div>
            <p className="mt-3 text-center text-xs text-sky-50">
              Search across 50+ operators · QRIS, GoPay, OVO, DANA, Bank Transfer, Visa/MC accepted
            </p>
          </div>
        </div>
      </section>

      {/* PROMO BANNER */}
      <section className="container -mt-12 mb-12">
        <div className="mx-auto max-w-5xl rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                  PROMO
                </span>
                <h3 className="text-lg font-bold text-amber-900">
                  Save 15% on Gili Islands routes
                </h3>
              </div>
              <p className="mt-1 text-sm text-amber-800">
                Book before 31 May 2026 · Use code <span className="font-mono font-semibold">GILIJET15</span> at checkout
              </p>
            </div>
            <Button asChild className="bg-amber-600 hover:bg-amber-700">
              <Link href="/search?origin=Padang+Bai&destination=Gili+Trawangan">
                Book now
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* POPULAR ROUTES */}
      <section className="container mb-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                Popular routes
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Where Indonesia is heading this week
              </p>
            </div>
            <Link
              href="/search"
              className="hidden text-sm font-medium text-sky-700 hover:underline sm:inline"
            >
              See all →
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {POPULAR_ROUTES.map((route) => (
              <Link
                key={`${route.from}-${route.to}`}
                href={`/search?origin=${encodeURIComponent(route.from)}&destination=${encodeURIComponent(route.to)}`}
                className="group block"
              >
                <Card className="overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5">
                  <div className="flex items-center gap-4 p-4">
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-sky-50 text-3xl">
                      {route.image}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-sm text-slate-500">
                        <span className="truncate">{route.from}</span>
                        <span>→</span>
                        <span className="truncate">{route.to}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {route.duration}
                      </div>
                      <div className="mt-1">
                        <span className="text-xs text-slate-500">from </span>
                        <span className="text-lg font-bold text-sky-700">
                          IDR {route.price.toLocaleString("id-ID")}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED DESTINATIONS */}
      <section className="bg-slate-50 py-16">
        <div className="container">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                Explore Indonesia by sea
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                From the Gilis to Komodo — every island, one tap away
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURED_DESTINATIONS.map((dest) => (
                <Card
                  key={dest.name}
                  className="overflow-hidden transition-all hover:shadow-lg"
                >
                  <div className="h-32 bg-gradient-to-br from-sky-400 to-cyan-500 relative">
                    <div className="absolute bottom-2 left-3 text-white">
                      <div className="text-lg font-bold">{dest.name}</div>
                    </div>
                  </div>
                  <CardContent className="pt-4">
                    <p className="text-sm text-slate-600 line-clamp-2">
                      {dest.description}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <Badge variant="outline">
                        {dest.routes} routes
                      </Badge>
                      <div>
                        <span className="text-slate-500">from </span>
                        <span className="font-semibold text-sky-700">
                          IDR {dest.from.toLocaleString("id-ID")}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* WHY BOOK WITH US */}
      <section className="container py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Why book with Gilijet
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              The same convenience you expect for flights — now for boats
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_BADGES.map((badge) => (
              <Card key={badge.title} className="text-center">
                <CardContent className="pt-6">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-2xl">
                    ✓
                  </div>
                  <div className="font-semibold text-slate-900">
                    {badge.title}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {badge.desc}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-sky-50 py-16">
        <div className="container">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                How it works
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Four steps to your boarding pass
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { step: "1", title: "Search", desc: "Pick your route, date, and passengers" },
                { step: "2", title: "Choose", desc: "Compare operators on time and price" },
                { step: "3", title: "Pay", desc: "QRIS, e-wallet, bank transfer, or card" },
                { step: "4", title: "Board", desc: "Show your QR e-ticket at the dock" },
              ].map((s) => (
                <div key={s.step} className="relative text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-600 text-lg font-bold text-white">
                    {s.step}
                  </div>
                  <div className="mt-3 font-semibold text-slate-900">
                    {s.title}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* OPERATOR CTA */}
      <section className="container py-16">
        <div className="mx-auto max-w-5xl rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white sm:p-12">
          <div className="grid items-center gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-2xl font-bold sm:text-3xl">
                Run a boat business?
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                Sell tickets online with a flat 8% commission, weekly
                settlements, and a free QR scanner for your crew.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              <Button asChild size="lg" className="bg-white text-slate-900 hover:bg-slate-100">
                <Link href="/operator/login">Operator portal</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                <Link href="/contact">Get in touch</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST FOOTER STRIP */}
      <section className="border-t bg-white py-8">
        <div className="container">
          <div className="mx-auto max-w-5xl text-center text-xs text-slate-600">
            <div className="font-semibold text-slate-900">
              Secure, verified, regulated
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <span>🔒 Payments by Xendit (Bank Indonesia licensed)</span>
              <span>·</span>
              <span>✓ All operators KYC verified</span>
              <span>·</span>
              <span>🛡️ UU PDP compliant</span>
              <span>·</span>
              <span>📞 24-hour customer support</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
