import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { SearchForm } from "@/components/customer/search-form";
import { DepartingToday } from "@/components/customer/departing-today";
import { ReviewsCarousel } from "@/components/customer/reviews-carousel";
import { NearestPortCard } from "@/components/customer/nearest-port-card";
import { WaveDivider } from "@/components/ui/wave-divider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getDepartingSoon,
  getPopularRoutes,
  getRecentReviews,
  getTrustNumbers,
  getActivePromo,
  maybeAutoSeed,
  TRUST_THRESHOLDS,
} from "@/lib/home-data";
import { photoForPort } from "@/lib/destination-photos";
import { POSTS } from "@/content/blog";
import { Ship } from "lucide-react";

const ARTICLE_IMAGES = [
  "/brand/articles/article-ubud.png",
  "/brand/articles/article-resort.png",
  "/brand/articles/article-temple.png",
  "/brand/articles/article-kuta.png",
];

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
    destinationPort: "Gili Trawangan",
    description: "Crystal water, no cars, perfect snorkeling",
    routes: 12,
    from: 85_000,
  },
  {
    name: "Nusa Penida",
    slug: "nusa-penida",
    destinationPort: "Nusa Penida",
    description: "Dramatic cliffs and Kelingking beach",
    routes: 8,
    from: 200_000,
  },
  {
    name: "Lombok",
    slug: "lombok",
    destinationPort: "Bangsal",
    description: "Mount Rinjani and pink-sand beaches",
    routes: 6,
    from: 395_000,
  },
  {
    name: "Komodo",
    slug: "komodo",
    destinationPort: "Labuan Bajo",
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
  const t = await getTranslations();
  // Trigger seed if DB is empty (fire-and-forget, returns in <1s when seeded).
  const seedStatus = await maybeAutoSeed();

  const [departures, popularRoutes, reviews, trust, promo] = await Promise.all([
    getDepartingSoon().catch(() => []),
    getPopularRoutes().catch(() => []),
    getRecentReviews().catch(() => []),
    getTrustNumbers().catch(() => ({
      bookingsLast30Days: 0,
      averageRating: 0,
      totalReviews: 0,
      activeOperators: 0,
    })),
    getActivePromo().catch(() => null),
  ]);

  const hasDepartures = departures.length > 0;
  const isSeeding = seedStatus.state === "seeding" && !hasDepartures;
  const hasReviews = reviews.length > 0;
  const showBookings = trust.bookingsLast30Days >= TRUST_THRESHOLDS.bookings;
  const showReviews = trust.totalReviews >= TRUST_THRESHOLDS.reviews;
  const showOperators = trust.activeOperators >= TRUST_THRESHOLDS.operators;
  const showAnyTrustNumber = showBookings || showReviews || showOperators;

  return (
    <>
      {/* ─── HERO ─── (Figma illustration + display slogan) */}
      <section className="relative overflow-hidden pb-36 pt-16 sm:pb-44 sm:pt-20">
        <Image
          src="/brand/hero-home.png"
          alt="Island-hopping by fast boat across Indonesia"
          fill
          priority
          sizes="100vw"
          // A phone sees only the middle ~44% of a 2.2:1 image. Centred, that
          // lands on a slab of hull with the temple cut in half; 25% frames the
          // whole pura and the bow instead.
          className="object-cover object-[25%_center] sm:object-center"
        />
        {/* Scrim shaped to the copy, not to the sky.
            This was `from-black/20 via-transparent`, and Tailwind puts `via` at
            50% — so the subtitle, which starts below the midpoint, had no scrim
            at all and measured 1.17:1 against white glyphs. Holding ~55% down to
            66% covers both the slogan and the paragraph, then releasing by 82%
            leaves the hull and water — already high-contrast, and the best part
            of the illustration — at full brightness. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,12,28,0.62)_0%,rgba(3,12,28,0.60)_66%,rgba(3,12,28,0)_82%)]" />

        <div className="container relative">
          <div className="mx-auto max-w-6xl text-center">
            <h1 className="mx-auto max-w-4xl text-4xl font-display font-extrabold leading-[0.98] text-white drop-shadow-lg sm:text-6xl lg:text-7xl">
              Let Journey Begin with Gilibali!
            </h1>
            {/* Solid white, not white/90: the value proposition was rendering
                at lower contrast than the heading above it. */}
            <p className="mx-auto mt-4 max-w-2xl text-lg text-white drop-shadow-md sm:text-xl">
              {t("home.heroSubtitle")}
            </p>
          </div>
        </div>
      </section>

      {/* Wave divider behind search card */}
      <div className="relative z-0">
        <WaveDivider fillClass="fill-gilijet-foam" />

        {/* Search card — overlaps the hero/content boundary. Circular photo
            blob on the left (Figma motif) + the live search form. */}
        <div className="relative z-10 -mt-12 mx-auto max-w-6xl px-4">
          <div className="flex overflow-hidden rounded-[10px] bg-white shadow-ambient">
            <div className="relative hidden w-72 shrink-0 lg:block">
              <Image
                src="/brand/search-card-photo.png"
                alt=""
                fill
                sizes="288px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-brand/45" />
              <div className="absolute inset-0 flex flex-col justify-center p-6 text-white">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Ship size={18} /> Boat Trip
                </div>
                <div className="mt-2 text-2xl font-extrabold leading-tight drop-shadow">
                  Find the Best Deals on Boat for your Trip
                </div>
              </div>
            </div>
            <div className="flex-1">
              <SearchForm origins={SEED_ORIGINS} destinations={SEED_DESTINATIONS} />
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">
            {t("home.searchAcross")}
          </p>
        </div>
      </div>

      {/* ─── NEAREST PORT ─── */}
      <section className="container mt-8">
        <div className="mx-auto max-w-5xl">
          <NearestPortCard />
        </div>
      </section>

      {/* ─── DEPARTING SOON ─── */}
      {hasDepartures && (
        <section className="bg-gilijet-foam">
          <div className="container pt-8 pb-10">
            <DepartingToday departures={departures} />
          </div>
        </section>
      )}

      {/* ─── SEEDING SKELETON ─── */}
      {isSeeding && (
        <section className="bg-gilijet-foam">
          <div className="container pt-8 pb-10">
            <div className="mx-auto max-w-6xl">
              <h2 className="mb-4 text-xl font-display font-bold text-slate-900 sm:text-2xl">
                Departing soon
              </h2>
              <p className="mb-6 text-sm text-slate-500">
                {seedStatus.message}
              </p>
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-72 flex-shrink-0 rounded-xl border border-slate-200 bg-white p-4 animate-pulse"
                  >
                    <div className="mb-3 h-5 w-24 rounded-full bg-slate-200" />
                    <div className="mb-2 h-4 w-40 rounded bg-slate-200" />
                    <div className="mb-4 h-3 w-32 rounded bg-slate-100" />
                    <div className="mb-2 h-3 w-20 rounded bg-slate-100" />
                    <div className="mb-3 h-1.5 rounded-full bg-slate-100" />
                    <div className="flex items-center justify-between">
                      <div className="h-5 w-16 rounded bg-slate-200" />
                      <div className="h-5 w-14 rounded bg-slate-200" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─── PROMO BANNER ─── */}
      {promo && (
        <section className="container mt-8 mb-12">
          <div className="mx-auto max-w-5xl rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gilijet-coral px-2 py-0.5 text-xs font-bold text-white">
                    PROMO
                  </span>
                  <h3 className="text-lg font-display font-bold text-amber-900">
                    {promo.discountType === "PERCENT"
                      ? `Save ${promo.discountValue}% on your next trip`
                      : `Save IDR ${promo.discountValue.toLocaleString("id-ID")} on your next trip`}
                  </h3>
                </div>
                <p className="mt-1 text-sm text-amber-800">
                  {promo.description && <span>{promo.description} · </span>}
                  Use code{" "}
                  <span className="font-mono font-semibold">{promo.code}</span> at
                  checkout
                  {promo.expiresAt && (
                    <>
                      {" "}· Valid until{" "}
                      {new Date(promo.expiresAt).toLocaleDateString("en-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </>
                  )}
                </p>
              </div>
              <Button asChild className="w-full bg-gilijet-coral hover:bg-gilijet-coralDeep sm:w-auto">
                <Link href="/search">Book now</Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ─── POPULAR ROUTES ─── */}
      <section className="container mb-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-display font-bold text-slate-900 sm:text-3xl">
                {t("home.popularRoutes")}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {t("home.popularSubtitle")}
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

      {/* ─── ARTICLE AND BLOG ─── (Figma) */}
      {POSTS.length > 0 && (
        <section className="container mb-16">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-baseline justify-between">
              <h2 className="text-2xl font-display font-bold text-slate-900 sm:text-3xl">
                Article and Blog
              </h2>
              <Link
                href="/blog"
                className="text-sm font-medium text-slate-500 hover:text-brand hover:underline"
              >
                More Article →
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {POSTS.slice(0, 3).map((post, i) => (
                <Link
                  key={post.meta.slug}
                  href={`/blog/${post.meta.slug}`}
                  className="group block"
                >
                  <Card className="overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="relative h-48 w-full overflow-hidden">
                      <Image
                        src={ARTICLE_IMAGES[i % ARTICLE_IMAGES.length]}
                        alt=""
                        fill
                        sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <CardContent className="pt-4">
                      <div className="min-h-[3.25rem] font-semibold leading-snug text-slate-900 line-clamp-2">
                        {post.meta.title}
                      </div>
                      <div className="mt-3 text-sm font-medium text-slate-500">
                        {new Date(post.meta.publishedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Wave divider before destinations */}
      <WaveDivider fillClass="fill-slate-50" />

      {/* ─── FEATURED DESTINATIONS ─── */}
      <section className="bg-slate-50 py-16">
        <div className="container">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-display font-bold text-slate-900 sm:text-3xl">
                {t("home.exploreTitle")}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {t("home.exploreSubtitle")}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURED_DESTINATIONS.map((dest) => {
                const photo = photoForPort(dest.slug);
                return (
                  <Link
                    key={dest.slug}
                    href={`/search?destination=${encodeURIComponent(dest.destinationPort)}`}
                    aria-label={`Browse boats to ${dest.name}`}
                    className="group block focus:outline-none focus:ring-2 focus:ring-gilijet-ocean rounded-lg"
                  >
                    <Card className="overflow-hidden transition-all group-hover:shadow-lg group-hover:-translate-y-0.5">
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
                  </Link>
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
                {t("home.reviewsTitle")}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {t("home.reviewsSubtitle")}
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
              {t("home.whyTitle")}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {t("home.whySubtitle")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: t("trust.bestPrice"), desc: t("trust.bestPriceDesc") },
              { title: t("trust.support"), desc: t("trust.supportDesc") },
              { title: t("trust.eTicket"), desc: t("trust.eTicketDesc") },
              { title: t("trust.secure"), desc: t("trust.secureDesc") },
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
              {t("home.howTitle")}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {t("home.howSubtitle")}
            </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { step: "1", title: t("howItWorks.step1Title"), desc: t("howItWorks.step1Desc") },
                { step: "2", title: t("howItWorks.step2Title"), desc: t("howItWorks.step2Desc") },
                { step: "3", title: t("howItWorks.step3Title"), desc: t("howItWorks.step3Desc") },
                { step: "4", title: t("howItWorks.step4Title"), desc: t("howItWorks.step4Desc") },
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
                {t("operator.ctaTitle")}
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                {t("operator.ctaDesc")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              <Button asChild size="lg" className="bg-white text-slate-900 hover:bg-slate-100">
                <Link href="/operator/login">{t("operator.portal")}</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                <Link href="/contact">{t("operator.getInTouch")}</Link>
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
              {t("trust.secureVerified")}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <span>🔒 {t("trust.paymentsBy")}</span>
              <span>·</span>
              <span>✓ {t("trust.kycVerified")}</span>
              <span>·</span>
              <span>🛡️ {t("trust.pdpCompliant")}</span>
              <span>·</span>
              <span>📞 {t("trust.support24")}</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
