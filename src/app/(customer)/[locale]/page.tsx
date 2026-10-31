import Link from 'next/link';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { SearchForm } from '@/features/schedules/components/search-form';
import { DepartingToday } from '@/app/(customer)/[locale]/_components/departing-today';
import { ReviewsCarousel } from '@/app/(customer)/[locale]/_components/reviews-carousel';
import { NearestPortCard } from '@/app/(customer)/[locale]/_components/nearest-port-card';
import { Button } from '@/shared/ui/button';
import {
  getDepartingSoon,
  getPopularRoutes,
  getRecentReviews,
  getTrustNumbers,
  getActivePromo,
  getAvailablePorts,
  TRUST_THRESHOLDS,
} from '@/features/schedules/home-data';
import { photoForPort } from '@/features/ports/destination-photos';
import { POSTS } from '@/content/blog';
import { ArrowRight, Check } from 'lucide-react';

const ARTICLE_IMAGES = [
  '/brand/articles/article-ubud.png',
  '/brand/articles/article-resort.png',
  '/brand/articles/article-temple.png',
  '/brand/articles/article-kuta.png',
];

export const revalidate = 600;

const FEATURED_DESTINATIONS = [
  {
    name: 'Gili Islands',
    slug: 'gili-islands',
    destinationPort: 'Gili Trawangan',
    description: 'Crystal water, no cars, perfect snorkeling',
    routes: 12,
    from: 85_000,
  },
  {
    name: 'Nusa Penida',
    slug: 'nusa-penida',
    destinationPort: 'Nusa Penida',
    description: 'Dramatic cliffs and Kelingking beach',
    routes: 8,
    from: 200_000,
  },
  {
    name: 'Lombok',
    slug: 'lombok',
    destinationPort: 'Bangsal',
    description: 'Mount Rinjani and pink-sand beaches',
    routes: 6,
    from: 395_000,
  },
  {
    name: 'Komodo',
    slug: 'komodo',
    destinationPort: 'Labuan Bajo',
    description: 'Dragons, pink beach, and Padar viewpoint',
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

  const [departures, popularRoutes, reviews, trust, promo, portsByRegion] = await Promise.all([
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
    getAvailablePorts().catch(() => []),
  ]);

  // Extract port names for SearchForm (flattened list)
  const allPorts = portsByRegion.flatMap(group => group.ports.map(p => p.name));

  const hasDepartures = departures.length > 0;
  const hasReviews = reviews.length > 0;
  const showBookings = trust.bookingsLast30Days >= TRUST_THRESHOLDS.bookings;
  const showReviews = trust.totalReviews >= TRUST_THRESHOLDS.reviews;
  const showOperators = trust.activeOperators >= TRUST_THRESHOLDS.operators;
  const showAnyTrustNumber = showBookings || showReviews || showOperators;

  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative mx-5 mt-4 overflow-hidden rounded-[32px] pb-40 pt-12 sm:mx-6 sm:pb-52 sm:pt-24">
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
        {/* Scrim shaped to the copy: the heading and the paragraph sit in the
            top 60%, so that stretch stays dark enough for white text, then it
            releases by 85% so the hull and water show at full brightness
            (guarded by tests/unit/app/customer/hero-contrast.test.ts). */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,34,142,0.74)_0%,rgba(0,34,142,0.6)_62%,rgba(0,34,142,0)_85%)]" />

        <div className="container relative px-5 sm:px-8 lg:px-16">
          <div className="max-w-3xl text-white">
            <h1 className="font-display text-4xl font-extrabold leading-[1.04] tracking-tight drop-shadow-lg sm:text-6xl lg:text-[68px]">
              Let Journey Begin with Gilifast!
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white drop-shadow-md sm:text-[19px]">
              {t('home.heroSubtitle')}
            </p>
          </div>
        </div>
      </section>

      {/* Search card — floats over the bottom of the hero. */}
      <section className="relative z-10 mx-auto -mt-32 max-w-[1180px] px-5 sm:-mt-36 sm:px-6">
        <div className="rounded-[28px] bg-white shadow-ambient">
          <SearchForm origins={allPorts} destinations={allPorts} portsByRegion={portsByRegion} />
        </div>
        <p className="mt-4 text-center text-[13px] text-brand-muted">
          {t('home.searchAcross')}
        </p>
      </section>

      {/* ─── NEAREST PORT ─── */}
      <section className="mx-auto mt-8 max-w-[1180px] px-5 sm:px-6">
        <NearestPortCard />
      </section>

      {/* ─── DEPARTING SOON ─── */}
      {hasDepartures && (
        <section className="mx-auto mt-14 max-w-[1180px] px-5 sm:mt-[72px] sm:px-6">
          <DepartingToday departures={departures} />
        </section>
      )}

      {/* ─── PROMO BANNER ─── */}
      {promo && (
        <section className="mx-auto mt-12 max-w-[1180px] px-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-brand-line bg-brand-periwinkle p-6 sm:p-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand px-3 py-0.5 text-xs font-bold text-white">
                  PROMO
                </span>
                <h3 className="font-display text-lg font-bold text-brand-dark">
                  {promo.discountType === 'PERCENT'
                    ? `Save ${promo.discountValue}% on your next trip`
                    : `Save IDR ${promo.discountValue.toLocaleString('id-ID')} on your next trip`}
                </h3>
              </div>
              <p className="mt-2 text-sm text-brand-text">
                {promo.description && <span>{promo.description} · </span>}
                Use code{' '}
                <span className="font-mono font-semibold">{promo.code}</span> at
                checkout
                {promo.expiresAt && (
                  <>
                    {' '}· Valid until{' '}
                    {new Date(promo.expiresAt).toLocaleDateString('en-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </>
                )}
              </p>
            </div>
            <Button asChild className="w-full rounded-pill bg-brand px-6 font-semibold text-white hover:bg-brand-dark sm:w-auto">
              <Link href="/search">Book now</Link>
            </Button>
          </div>
        </section>
      )}

      {/* ─── FEATURED DESTINATIONS ─── bento grid from lg, stacked below */}
      <section className="mx-auto mt-14 max-w-[1180px] px-5 sm:mt-[88px] sm:px-6">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-[34px]">
          {t('home.exploreTitle')}
        </h2>
        <p className="mt-1.5 text-base text-brand-muted">
          {t('home.exploreSubtitle')}
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:grid-rows-[250px_250px]">
          {FEATURED_DESTINATIONS.map((dest, i) => {
            const photo = photoForPort(dest.slug);
            const big = i === 0;
            const wide = i === 3;
            return (
              <Link
                key={dest.slug}
                href={`/search?destination=${encodeURIComponent(dest.destinationPort)}`}
                aria-label={`Browse boats to ${dest.name}`}
                className={`group relative block min-h-[220px] overflow-hidden rounded-[28px] bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  big ? 'min-h-[290px] sm:col-span-2 lg:col-span-2 lg:row-span-2 lg:min-h-0' : ''
                } ${wide ? 'min-h-[290px] sm:col-span-2 lg:col-span-2 lg:min-h-0' : ''}`}
              >
                {photo && (
                  <Image
                    src={photo.url}
                    alt={photo.alt}
                    fill
                    sizes={big ? '(min-width: 1024px) 50vw, 100vw' : '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw'}
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/90 via-brand-dark/20 to-transparent" />
                <div className="absolute inset-x-6 bottom-5 text-white">
                  <div className={`font-display font-extrabold tracking-tight ${big ? 'text-3xl' : 'text-[22px]'}`}>
                    {dest.name}
                  </div>
                  {(big || wide) && (
                    <div className="mt-1 text-[15px]">{dest.description}</div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 text-[13px] font-semibold">
                    <span className="rounded-full bg-white/25 px-3 py-1.5">{dest.routes} routes</span>
                    <span className="rounded-full bg-white px-3 py-1.5 text-brand-dark">
                      from IDR {dest.from.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ─── POPULAR ROUTES ─── */}
      <section className="mx-auto mt-14 max-w-[1180px] px-5 sm:mt-[88px] sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-[34px]">
              {t('home.popularRoutes')}
            </h2>
            <p className="mt-1.5 text-base text-brand-muted">
              {t('home.popularSubtitle')}
            </p>
          </div>
          <Link
            href="/search"
            className="hidden text-[15px] font-semibold text-brand hover:underline sm:inline"
          >
            See all →
          </Link>
        </div>

        <div className="mt-6 border-t border-brand-line">
          {popularRoutes.map((route) => (
            <Link
              key={`${route.origin}-${route.destination}`}
              href={`/search?origin=${encodeURIComponent(route.origin)}&destination=${encodeURIComponent(route.destination)}`}
              className="group flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-brand-line px-2 py-5 transition-colors hover:bg-brand-surface sm:py-[22px]"
            >
              <div className="flex min-w-0 flex-1 basis-64 items-center gap-2 text-lg font-bold tracking-tight text-brand-ink sm:text-xl">
                <span className="truncate">{route.origin}</span>
                <span className="text-brand-muted">→</span>
                <span className="truncate">{route.destination}</span>
              </div>
              <div className="text-[15px] text-brand-muted sm:w-44">
                {formatDuration(route.durationMinutes)} · {route.operatorCount}{' '}
                operator{route.operatorCount === 1 ? '' : 's'}
              </div>
              <div className="text-sm text-brand-muted sm:w-44">
                from{' '}
                <strong className="text-xl font-extrabold text-brand">
                  IDR {route.cheapestPriceIDR.toLocaleString('id-ID')}
                </strong>
              </div>
              <span
                aria-hidden
                className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-periwinkle text-brand transition-colors group-hover:bg-brand group-hover:text-white"
              >
                <ArrowRight size={18} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── WHY BOOK WITH US ─── */}
      <section className="mx-5 mt-16 rounded-[32px] bg-brand-dark px-6 py-12 text-white sm:mx-6 sm:mt-24 sm:px-12 sm:py-16 lg:px-16">
        <div className="mx-auto max-w-[1180px]">
          <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-[34px]">
            {t('home.whyTitle')}
          </h2>
          <p className="mt-1.5 text-base text-brand-periwinkle">
            {t('home.whySubtitle')}
          </p>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
            {[
              { title: t('trust.bestPrice'), desc: t('trust.bestPriceDesc') },
              { title: t('trust.support'), desc: t('trust.supportDesc') },
              { title: t('trust.eTicket'), desc: t('trust.eTicketDesc') },
              { title: t('trust.secure'), desc: t('trust.secureDesc') },
            ].map((badge) => (
              <div key={badge.title} className="rounded-3xl bg-white/10 p-6">
                <div
                  aria-hidden
                  className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-brand-cyan text-white"
                >
                  <Check size={22} strokeWidth={2.4} />
                </div>
                <div className="mt-[18px] text-lg font-bold">{badge.title}</div>
                <div className="mt-1.5 text-sm leading-relaxed text-brand-periwinkle">{badge.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="mx-auto mt-16 max-w-[1180px] px-5 sm:mt-24 sm:px-6">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-[34px]">
          {t('home.howTitle')}
        </h2>
        <p className="mt-1.5 text-base text-brand-muted">
          {t('home.howSubtitle')}
        </p>
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-7">
          {[
            { step: '01', title: t('howItWorks.step1Title'), desc: t('howItWorks.step1Desc') },
            { step: '02', title: t('howItWorks.step2Title'), desc: t('howItWorks.step2Desc') },
            { step: '03', title: t('howItWorks.step3Title'), desc: t('howItWorks.step3Desc') },
            { step: '04', title: t('howItWorks.step4Title'), desc: t('howItWorks.step4Desc') },
          ].map((s) => (
            <div key={s.step} className="border-t-[3px] border-brand pt-[18px]">
              <div className="text-[44px] font-extrabold leading-none tracking-tighter text-brand">
                {s.step}
              </div>
              <div className="mt-2 text-xl font-bold text-brand-ink">{s.title}</div>
              <div className="mt-1.5 text-[15px] leading-relaxed text-brand-muted">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── REVIEWS CAROUSEL ─── */}
      {hasReviews && (
        <section className="mx-auto mt-16 max-w-[1180px] px-5 sm:mt-24 sm:px-6">
          <div className="rounded-[32px] bg-brand-periwinkle px-5 py-10 sm:p-11">
            <div className="mb-8 text-center">
              <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-dark sm:text-[34px]">
                {t('home.reviewsTitle')}
              </h2>
              <p className="mt-1.5 text-base text-brand-dark">
                {t('home.reviewsSubtitle')}
              </p>
            </div>
            <ReviewsCarousel reviews={reviews} />
          </div>
        </section>
      )}

      {/* ─── ARTICLE AND BLOG ─── */}
      {POSTS.length > 0 && (
        <section className="mx-auto mt-16 max-w-[1180px] px-5 sm:mt-24 sm:px-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-[34px]">
              Article and Blog
            </h2>
            <Link
              href="/blog"
              className="text-[15px] font-semibold text-brand hover:underline"
            >
              More Article →
            </Link>
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {POSTS.slice(0, 3).map((post, i) => (
              <Link
                key={post.meta.slug}
                href={`/blog/${post.meta.slug}`}
                className="group block overflow-hidden rounded-3xl border border-brand-line bg-white transition-shadow hover:shadow-ambient"
              >
                <div className="relative h-48 w-full overflow-hidden">
                  <Image
                    src={ARTICLE_IMAGES[i % ARTICLE_IMAGES.length]}
                    alt=""
                    fill
                    sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-6">
                  <div className="min-h-[3.25rem] font-semibold leading-snug text-brand-ink line-clamp-2">
                    {post.meta.title}
                  </div>
                  <div className="mt-3 text-sm font-medium text-brand-muted">
                    {new Date(post.meta.publishedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ─── OPERATOR CTA ─── */}
      <section className="mx-auto mt-14 max-w-[1180px] px-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-[32px] bg-brand p-8 text-white sm:px-11 sm:py-10">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
              {t('operator.ctaTitle')}
            </h2>
            <p className="mt-2 text-base leading-relaxed text-brand-periwinkle">
              {t('operator.ctaDesc')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-pill bg-white font-bold text-brand-dark hover:bg-brand-periwinkle">
              <Link href="/operator/login">{t('operator.portal')}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-pill border-white bg-transparent font-semibold text-white hover:bg-white/10 hover:text-white">
              <Link href="/contact">{t('operator.getInTouch')}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── TRUST FOOTER STRIP ─── */}
      <section className="mt-14 border-t border-brand-line bg-white py-8 sm:mt-[72px]">
        <div className="container px-5">
          <div className="mx-auto max-w-5xl text-center text-xs text-brand-muted">
            {showAnyTrustNumber && (
              <div className="mb-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm font-semibold text-brand-ink">
                {showBookings && (
                  <span>
                    {trust.bookingsLast30Days.toLocaleString('id-ID')} trips booked
                    in the last 30 days
                  </span>
                )}
                {showReviews && (
                  <span>
                    {trust.averageRating.toFixed(1)} ★ from{' '}
                    {trust.totalReviews.toLocaleString('id-ID')} reviews
                  </span>
                )}
                {showOperators && (
                  <span>{trust.activeOperators} active operators</span>
                )}
              </div>
            )}
            <div className="font-semibold text-brand-ink">
              {t('trust.secureVerified')}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <span>🔒 {t('trust.paymentsBy')}</span>
              <span>·</span>
              <span>✓ {t('trust.kycVerified')}</span>
              <span>·</span>
              <span>🛡️ {t('trust.pdpCompliant')}</span>
              <span>·</span>
              <span>📞 {t('trust.support24')}</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
