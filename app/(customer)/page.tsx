import Link from "next/link";
import Image from "next/image";
import { SearchForm } from "@/components/customer/search-form";
import { DepartingToday } from "@/components/customer/departing-today";
import { ReviewsCarousel } from "@/components/customer/reviews-carousel";
import { WaveDivider } from "@/components/ui/wave-divider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getDepartingSoon,
  getPopularRoutes,
  getRecentReviews,
  getTrustNumbers,
  TRUST_THRESHOLDS,
} from "@/lib/home-data";
import { HERO_PHOTO, photoForPort } from "@/lib/destination-photos";

export const revalidate = 600;

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

const FEATURED_DESTINATIONS = [
  {
    name: "Gili Islands",
    slug: "gili-islands",
    description: "Crystal water, no cars, perfect snorkeling",
    routes: 12,
    from: 85_000,
  },
  {
    name: "Nusa Penida",
    slug: "nusa-penida",
    description: "Dramatic cliffs and Kelingking beach",
    routes: 8,
    from: 200_000,
  },
  {
    name: "Lombok",
    slug: "lombok",
    description: "Mount Rinjani and pink-sand beaches",
    routes: 6,
    from: 395_000,
  },
  {
    name: "Komodo",
    slug: "komodo",
    description: "Dragons, pink beach, and Padar viewpoint",
    routes: 4,
    from: 750_000,
  },
];

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default async function HomePage() {
  const [departures, popularRoutes, reviews, trust] = await Promise.all([
    getDepartingSoon().catch(() => []),
    getPopularRoutes().catch(() => []),
    getRecentReviews().catch(() => []),
    getTrustNumbers().catch(() => ({
      bookingsLast30Days: 0,
      averageRating: 0,
      totalReviews: 0,
      activeOperators: 0,
    })),
  ]);

  const hasDepartures = departures.length > 0;
  const hasReviews = reviews.length > 0;
  const showBookings = trust.bookingsLast30Days >= TRUST_THRESHOLDS.bookings;
  const showReviews = trust.totalReviews >= TRUST_THRESHOLDS.reviews;
  const showOperators = trust.activeOperators >= TRUST_THRESHOLDS.operators;
  const showAnyTrustNumber = showBookings || showReviews || showOperators;

  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden pb-32 pt-12 sm:pb-40 sm:pt-16">
        <Image
          src={HERO_PHOTO.url}
          alt={HERO_PHOTO.alt}
          fill
          priority
          sizes="100vw"
          className="object-cover brightness-[0.6]"
        />
        {/* Left-to-right scrim — leaves the right side of the photo visible */}
        <div className="absolute inset-0 bg-gradient-to-r from-gilijet-deep/70 via-gilijet-deep/50 to-transparent" />

        {/* Photo credit */}
        {HERO_PHOTO.credit && (
          <div className="absolute bottom-3 right-4 z-10 text-xs text-white/60">
            Photo by {HERO_PHOTO.credit}
          </div>
        )}

        <div className="container relative">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <Badge className="bg-gilijet-coral/20 text-white border-white/20">
                Indonesia&apos;s #1 boat ticketing platform
              </Badge>
              <h1 className="mt-4 text-4xl font-display font-extrabold text-white drop-shadow sm:text-5xl lg:text-6xl">
                Island-hop with confidence
              </h1>
              <p className="mt-4 text-lg text-white/90 drop-shadow sm:text-xl max-w-prose">
                Book verified fast boats and ferries across Indonesia.
                Pay your way, get e-tickets instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Wave divider behind search card */}
      <div className="relative z-0">
        <WaveDivider fillClass="fill-gilijet-foam" />

        {/* Search card — overlaps the hero/content boundary */}
        <div className="relative z-10 -mt-12 mx-auto max-w-5xl px-4">
          <div className="rounded-2xl bg-white p-2 shadow-2xl">
            <SearchForm origins={SEED_ORIGINS} destinations={SEED_DESTINATIONS} />
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">
            Search across 50+ operators · QRIS, GoPay, OVO, DANA, Bank Transfer, Visa/MC accepted
          </p>
        </div>
      </div>

      {/* ─── DEPARTING SOON ─── */}
      {hasDepartures && (
        <section className="bg-gilijet-foam">
          <div className="container pt-8 pb-10">
            <DepartingToday departures={departures} />
          </div>
        </section>
      )}

      {/* ─── PROMO BANNER ─── */}
      <section className="container mt-8 mb-12">
        <div className="mx-auto max-w-5xl rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-gilijet-coral px-2 py-0.5 text-xs font-bold text-white">
                  PROMO
                </span>
                <h3 className="text-lg font-display font-bold text-amber-900">
                  Save 15% on Gili Islands routes
                </h3>
              </div>
              <p className="mt-1 text-sm text-amber-800">
                Book before 31 May 2026 · Use code{" "}
                <span className="font-mono font-semibold">GILIJET15</span> at checkout
              </p>
            </div>
            <Button asChild className="bg-gilijet-coral hover:bg-gilijet-coralDeep">
              <Link href="/search?origin=Padang+Bai&destination=Gili+Trawangan">
                Book now
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── POPULAR ROUTES ─── */}
      <section className="container mb-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-display font-bold text-slate-900 sm:text-3xl">
                Popular routes
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Where Indonesia is heading this week
              </p>
            </div>
            <Link
              href="/search"
              className="hidden text-sm font-medium text-gilijet-deep hover:underline sm:inline"
            >
              See all →
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popularRoutes.map((route) => {
              const photo = photoForPort(route.destination);
              return (
                <Link
                  key={`${route.origin}-${route.destination}`}
                  href={`/search?origin=${encodeURIComponent(route.origin)}&destination=${encodeURIComponent(route.destination)}`}
                  className="group block"
                >
                  <Card className="overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5">
                    <div className="flex items-center gap-4 p-4">
                      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-gilijet-foam">
                        {photo && (
                          <Image
                            src={photo.url}
                            alt={photo.alt}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 text-sm font-medium text-slate-900">
                          <span className="truncate">{route.origin}</span>
                          <span className="text-slate-400">→</span>
                          <span className="truncate">{route.destination}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <span>{formatDuration(route.durationMinutes)}</span>
                          <span>·</span>
                          <span>
                            {route.operatorCount}{" "}
                            operator{route.operatorCount === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="mt-1">
                          <span className="text-xs text-slate-500">from </span>
                          <span className="text-lg font-bold text-gilijet-deep">
                            IDR {route.cheapestPriceIDR.toLocaleString("id-ID")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Wave divider before destinations */}
      <WaveDivider fillClass="fill-slate-50" />

      {/* ─── FEATURED DESTINATIONS ─── */}
      <section className="bg-slate-50 py-16">
        <div className="container">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-display font-bold text-slate-900 sm:text-3xl">
                Explore Indonesia by sea
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                From the Gilis to Komodo — every island, one tap away
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURED_DESTINATIONS.map((dest) => {
                const photo = photoForPort(dest.slug);
                return (
                  <Card
                    key={dest.slug}
                    className="overflow-hidden transition-all hover:shadow-lg"
                  >
                    <div className="relative h-36 bg-gradient-to-br from-gilijet-ocean to-gilijet-deep">
                      {photo && (
                        <Image
                          src={photo.url}
                          alt={photo.alt}
                          fill
                          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                          className="object-cover"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                      <div className="absolute bottom-2 left-3 text-white">
                        <div className="text-lg font-display font-bold drop-shadow">
                          {dest.name}
                        </div>
                      </div>
                    </div>
                    <CardContent className="pt-4">
                      <p className="text-sm text-slate-600 line-clamp-2">
                        {dest.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <Badge variant="outline">{dest.routes} routes</Badge>
                        <div>
                          <span className="text-slate-500">from </span>
                          <span className="font-semibold text-gilijet-deep">
                            IDR {dest.from.toLocaleString("id-ID")}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Wave divider before reviews */}
      <WaveDivider fillClass="fill-white" />

      {/* ─── REVIEWS CAROUSEL ─── */}
      {hasReviews && (
        <section className="container py-16">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-display font-bold text-slate-900 sm:text-3xl">
                What travellers say
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Real reviews from real bookings
              </p>
            </div>
            <ReviewsCarousel reviews={reviews} />
          </div>
        </section>
      )}

      {/* ─── WHY BOOK WITH US ─── */}
      <section className="container py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-display font-bold text-slate-900 sm:text-3xl">
              Why book with Gilijet
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              The same convenience you expect for flights — now for boats
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Best Price Guaranteed", desc: "No hidden fees, transparent pricing" },
              { title: "24/7 Customer Support", desc: "WhatsApp +62 812 3456 7890" },
              { title: "Instant E-Ticket", desc: "QR code delivered to your email" },
              { title: "Secure Payment", desc: "Powered by Mayar, BI licensed gateway" },
            ].map((badge) => (
              <Card key={badge.title} className="text-center">
                <CardContent className="pt-6">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gilijet-foam text-2xl text-gilijet-deep">
                    ✓
                  </div>
                  <div className="font-semibold text-slate-900">{badge.title}</div>
                  <div className="mt-1 text-xs text-slate-600">{badge.desc}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="bg-gilijet-foam py-16">
        <div className="container">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-display font-bold text-slate-900 sm:text-3xl">
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
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gilijet-deep text-lg font-bold text-white">
                    {s.step}
                  </div>
                  <div className="mt-3 font-semibold text-slate-900">{s.title}</div>
                  <div className="mt-1 text-xs text-slate-600">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Wave divider before operator CTA */}
      <WaveDivider fillClass="fill-white" />

      {/* ─── OPERATOR CTA ─── */}
      <section className="container py-16">
        <div className="mx-auto max-w-5xl rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white sm:p-12">
          <div className="grid items-center gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-2xl font-display font-bold sm:text-3xl">
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

      {/* ─── TRUST FOOTER STRIP ─── */}
      <section className="border-t bg-white py-8">
        <div className="container">
          <div className="mx-auto max-w-5xl text-center text-xs text-slate-600">
            {showAnyTrustNumber && (
              <div className="mb-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm font-semibold text-slate-900">
                {showBookings && (
                  <span>
                    {trust.bookingsLast30Days.toLocaleString("id-ID")} trips booked
                    in the last 30 days
                  </span>
                )}
                {showReviews && (
                  <span>
                    {trust.averageRating.toFixed(1)} ★ from{" "}
                    {trust.totalReviews.toLocaleString("id-ID")} reviews
                  </span>
                )}
                {showOperators && (
                  <span>{trust.activeOperators} active operators</span>
                )}
              </div>
            )}
            <div className="font-semibold text-slate-900">
              Secure, verified, regulated
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <span>🔒 Payments by Mayar (Bank Indonesia licensed)</span>
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
