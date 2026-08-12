# Home Page Revamp — Plan & Requirements

**Audience:** an LLM implementing this without prior context from the planning conversation.
**Read first:** `CLAUDE.md`, `app/(customer)/page.tsx`, `app/(customer)/search/page.tsx`, `lib/datetime.ts`, `lib/operator-data.ts`, `lib/port-info.ts`, `prisma/schema.prisma`.
**Branch:** `claude/boat-ticketing-mvp-YAGl9`.
**Scope of this document:** Phase A is to be implemented now. Phases B / C / D are scoped but not built — design constraints only.

---

## Context

`app/(customer)/page.tsx` is the marketing landing page. Today it renders:
- Hero with gradient + `SearchForm`
- Hardcoded promo banner (`GILIFAST15`)
- Hardcoded `POPULAR_ROUTES` (6 emoji-prefixed routes with fake prices)
- Hardcoded `FEATURED_DESTINATIONS` (4 destinations with gradient placeholder cards)
- Hardcoded `TRUST_BADGES` and four-step "How it works"
- Operator CTA + static trust footer strip

Everything below the search form is static marketing copy. There is no live data, no real photography, no proof of usage, no personalisation, and no SEO surface beyond this single page. The schema already supports the data the home page needs (`Booking`, `Review`, `Leg`, `Schedule`, `Boat`) — Phase A is purely a read-side change.

**Non-goals for this task:** new product features, payment changes, operator-side work, mobile app. UI changes only, plus the read-side data layer required to feed them.

---

## Phase A — Visual & content polish (IMPLEMENT NOW)

Five sub-tasks. Ship them as a single PR. They share a new `lib/home-data.ts` and they're all on `app/(customer)/page.tsx`.

### A1. Real photography

**Problem.** The destination cards (`page.tsx:208-235`) and the hero background are gradient placeholders. Looks like an unfinished prototype.

**Change.**

1. Create `lib/destination-photos.ts` — a typed registry keyed by port slug:

```ts
export type DestinationPhoto = {
  url: string;          // remote URL or /public path
  alt: string;          // for a11y; describes what's in the photo
  credit?: string;      // photographer credit (Unsplash terms)
};

export const DESTINATION_PHOTOS: Record<string, DestinationPhoto> = {
  "gili-trawangan": { url: "...", alt: "Aerial view of Gili Trawangan's turquoise water and white-sand beach" },
  "nusa-penida":    { url: "...", alt: "Kelingking Beach cliff viewpoint, Nusa Penida" },
  "lombok":         { url: "...", alt: "Mount Rinjani crater lake at sunrise" },
  "komodo":         { url: "...", alt: "Pink Beach panorama with traditional Phinisi boat in foreground" },
  "sanur":          { url: "...", alt: "Sanur sunrise with prayer boats" },
  "padang-bai":     { url: "...", alt: "Fast boats moored at Padang Bai harbour" },
  "bangsal":        { url: "...", alt: "Bangsal harbour from the deck of a Gili boat" },
  "nusa-lembongan": { url: "...", alt: "Devil's Tear viewpoint, Nusa Lembongan" },
  "labuan-bajo":    { url: "...", alt: "Labuan Bajo harbour at golden hour with Phinisi boats" },
};

export function photoForPort(slug: string): DestinationPhoto | null {
  return DESTINATION_PHOTOS[slug] ?? null;
}
```

Use Unsplash. Pick photos with permissive licences; include `credit` on every entry. Add the Unsplash CDN domain to `next.config.mjs` under `images.remotePatterns`.

2. Hero background: drop a single high-quality boat-on-water photo into `public/hero/boats-bali.jpg` (1920×1080, < 250 KB after compression). Replace the gradient `<section>` (`page.tsx:75-110`) with a `next/image` `fill` plus a dark scrim `bg-black/40` overlay so white text stays legible. Keep the existing gradient as the fallback `bg-` class for slow connections.

3. Destination cards (`page.tsx:208-235`): swap the gradient `<div>` for a `next/image` using `photoForPort(slug)`. Keep the bottom-left name overlay; add a subtle gradient overlay for legibility.

**Acceptance.**

- `lib/destination-photos.ts` exists with at least 8 entries.
- `next.config.mjs` `images.remotePatterns` includes the photo source domain(s).
- `app/(customer)/page.tsx` uses `next/image` for hero + destination cards.
- Lighthouse accessibility score on the home page is ≥ 95 (alt text present on every image).
- No CLS regression (hero photo declares aspect-ratio via `next/image`).

---

### A2. Live popular routes

**Problem.** `POPULAR_ROUTES` array is hardcoded with fake prices. A visitor can't tell if these routes are real.

**Change.**

1. New module `lib/home-data.ts` exporting:

```ts
export type PopularRoute = {
  origin: string;
  destination: string;
  cheapestPriceIDR: number;
  operatorCount: number;
  averageDurationMinutes: number;
  photoSlug: string;  // for photoForPort()
};

export async function getPopularRoutes(limit = 6): Promise<PopularRoute[]>;
```

Implementation: query `Leg` for `status: OPEN`, `departureDate` between `now` and `now + 14 days`, group by `(schedule.originPort, schedule.destinationPort)`, return the cheapest `basePrice` and distinct `boat.operator` count per group. Order by total bookings in the last 30 days descending so genuinely popular routes surface first (fall back to alphabetical when no booking history exists).

```ts
// Sketch — adjust to actual schema:
const rows = await prisma.leg.groupBy({
  by: ["scheduleId"],
  where: {
    status: "OPEN",
    departureDate: { gte: now, lte: addDays(now, 14) },
    schedule: { deletedAt: null, boat: { deletedAt: null } },
  },
  _min: { basePrice: true },
  _count: { id: true },
});
// then join Schedule to get origin/destination/duration,
// dedupe by (origin, destination), aggregate operator counts.
```

2. Convert `HomePage` to an async server component (it's already a default export; just `async function HomePage()`).

3. Replace the `POPULAR_ROUTES.map` block (`page.tsx:158-190`) to consume the live data. Keep the same card shape so visuals are unchanged.

4. Add `export const revalidate = 600;` at the top of `app/(customer)/page.tsx` — 10-minute ISR. Acceptable freshness for prices that don't fluctuate by the second.

5. Fallback: if `getPopularRoutes()` returns an empty array (DB empty or query error), render a curated fallback set (the current `POPULAR_ROUTES` constant, kept as a fallback in `lib/home-data.ts`). The page must **never** render an empty section.

**Acceptance.**

- `lib/home-data.ts` exports `getPopularRoutes()`.
- Home page renders real prices and operator counts when seed data is present.
- Empty-DB fallback renders the curated default.
- One unit test: `getPopularRoutes()` returns the curated fallback when the DB is empty.

---

### A3. Departing today strip

**Problem.** No urgency signal. Same-day travellers (a major segment for boat routes) have to dive into search.

**Change.**

1. `lib/home-data.ts` adds:

```ts
export type DepartingSoon = {
  legId: string;
  origin: string;
  destination: string;
  departureUtc: Date;
  minutesUntilDeparture: number;
  availableSeats: number;
  totalCapacity: number;
  priceIDR: number;
  operatorName: string;
};

export async function getDepartingSoon(args?: { hoursAhead?: number; limit?: number }): Promise<DepartingSoon[]>;
```

Default `hoursAhead = 6`, `limit = 8`. Filter: `status: OPEN`, `availableSeats >= 1`, `departureDate` between `now` and `now + 6h`. Order by `departureDate ASC`.

2. New component `components/customer/departing-today.tsx`:
- Horizontal scroller using `overflow-x-auto` + `snap-x`.
- Each card shows: route (origin → destination), operator name, "Leaves in 2h 15m" using `lib/datetime.ts` for WITA-correct formatting, "4 of 12 seats left" with a thin progress bar, price, "Book →" button linking to `/book/[legId]`.
- Urgency badge: red "Leaves in <60min" / amber "60-180min" / sky ">180min".
- Empty state: hide the section entirely (don't render a "no boats" message — silence is better than a sad empty box).

3. Mount on `app/(customer)/page.tsx` immediately below the search section, before the promo banner. Use `force-dynamic` for **this section only** — but that's not possible per-section in Next 14. **Resolution:** keep page-level ISR at 10 min (acceptable; "Leaves in 2h 15m" can be off by 10 min and still useful) and have the client component re-compute the "minutes until" countdown every 30s using the `departureUtc` field so the *displayed* clock stays accurate even when the data is stale.

**Acceptance.**

- Section renders nothing when zero matching legs exist.
- "Minutes until departure" updates client-side every 30s without a server round-trip.
- Horizontal scroll works on mobile (touch + momentum) and desktop (mouse wheel).
- No layout shift when the section appears/disappears between revalidations.

---

### A4. Real reviews carousel

**Problem.** `TRUST_BADGES` are claims, not proof. No customer voice on the home page.

**Change.**

1. `lib/home-data.ts` adds:

```ts
export type HomeReview = {
  id: string;
  customerFirstName: string;
  rating: number;
  text: string;
  route: { origin: string; destination: string };
  createdAt: Date;
};

export async function getRecentReviews(limit = 8): Promise<HomeReview[]>;
```

Query `Review` joined with `Booking` + `Schedule`, filter `rating >= 4`, `text` not null, `createdAt` last 180 days. Order by `createdAt DESC`.

2. New component `components/customer/reviews-carousel.tsx`:
- Server component renders the data; a small `"use client"` wrapper drives the auto-rotation (6s interval).
- Card content: ★★★★★, route badge, review text (max 200 chars, truncate with ellipsis), "— {firstName}, {monthName} {year}".
- Pagination dots at the bottom; clicking a dot stops the auto-rotation for that session.
- Empty state: render a curated set of 3 mock-but-realistic reviews from a constant in the same component, clearly tagged as "from our pilot users" if the DB is empty. Decide with reviewer: hide entirely vs curated fallback. **Recommend hide entirely**.

3. Mount on `app/(customer)/page.tsx` after "Featured destinations", before "Why book with Gilifast".

**Acceptance.**

- Carousel auto-rotates every 6s; pauses on hover.
- Reduced-motion users (prefers-reduced-motion media query) see a static grid instead of a carousel.
- All reviews have a route badge and customer first name (never full name — strip last names server-side from `Booking.customerName`).
- Empty-DB behaviour matches the agreed strategy (see open question 2).

---

### A5. Authentic counter (trust strip)

**Problem.** Current footer strip (`page.tsx:333-351`) is generic claims.

**Change.**

1. `lib/home-data.ts` adds:

```ts
export type TrustNumbers = {
  bookingsLast30Days: number;
  averageRating: number;       // 0–5, one decimal
  totalReviews: number;
  activeOperators: number;
};

export async function getTrustNumbers(): Promise<TrustNumbers>;
```

Pull all four with one round of small queries (these don't need to be a single transaction — they're independent).

2. Replace the trust strip content with:

```
12,481 trips booked in the last 30 days
4.8 ★ avg from 2,103 reviews · 24 active operators
🔒 Payments by Mayar (BI licensed)  ·  ✓ UU PDP compliant  ·  📞 24-hour support
```

Numbers formatted with `toLocaleString("id-ID")` for the IDR-formatted thousands separator.

3. Fallback: if any number is < 10 (i.e. fresh deploy with little data), suppress that specific line rather than displaying obviously-tiny numbers. Show only the badges row. Threshold tweakable in `lib/home-data.ts`.

**Acceptance.**

- One section, real numbers, no "10 trips booked" embarrassment on a fresh deploy.
- Numbers use Indonesian thousands separator.

---

## Phase A deliverable checklist

- [ ] `lib/destination-photos.ts` created with ≥ 8 entries including alt text and credits
- [ ] `lib/home-data.ts` created exporting `getPopularRoutes`, `getDepartingSoon`, `getRecentReviews`, `getTrustNumbers`, plus the curated fallback constant for popular routes
- [ ] `next.config.mjs` updated for remote image domains
- [ ] `public/hero/boats-bali.jpg` added (compressed, < 250 KB)
- [ ] `app/(customer)/page.tsx` converted to async server component; consumes the new helpers
- [ ] `app/(customer)/page.tsx` declares `export const revalidate = 600`
- [ ] New component `components/customer/departing-today.tsx`
- [ ] New component `components/customer/reviews-carousel.tsx` (with client-only wrapper for rotation)
- [ ] Hardcoded `POPULAR_ROUTES`, `FEATURED_DESTINATIONS`, `TRUST_BADGES` arrays removed from `page.tsx` — curated fallbacks live in `lib/home-data.ts` only
- [ ] `scripts/seed-qa.ts` updated to produce enough departures + reviews to make the home page non-empty in dev
- [ ] One unit test for `getPopularRoutes` empty-DB fallback
- [ ] `pnpm typecheck` clean
- [ ] `pnpm seed:qa` runs and the home page renders with all five sections populated
- [ ] Lighthouse on the home page: Performance ≥ 80, Accessibility ≥ 95, SEO ≥ 95
- [ ] Commit message: `feat(home): real photography, live routes, departing-soon strip, reviews carousel, trust numbers`
- [ ] Push to `claude/boat-ticketing-mvp-YAGl9`

---

## Phase B — Personalisation & engagement (NOT NOW)

Designed; do not build during this task.

**B1. Returning-customer hero.** If `getCustomerSession()` resolves, swap hero copy for "Welcome back, {firstName} — your last trip was {origin} → {destination} on {date}. Book again?" with a rebook CTA pre-filling the search form. Anonymous users see the marketing copy.

**B2. Saved routes.** New tiny table `SavedRoute { id, customerId, originPort, destinationPort, createdAt }`. Heart icon on search-results route cards. Home page shows "Your saved routes" strip above popular routes when logged in.

**B3. Sticky search bar.** On scroll past the hero, slide a compact search row in below the nav. Uses a small client component to listen to scroll; falls back to a static link to `/search` when JS is disabled.

**B4. Locale toggle.** EN / ID switch in the header. Use `next-intl`. Extract all hardcoded strings on the home page first; the rest of the app follows in a separate PR. Default language inferred from `Accept-Language` header.

---

## Phase C — Conversion & trust (NOT NOW)

**C1. Visual route map.** Single hand-illustrated SVG of the Indonesian archipelago with clickable port pins. Pins drawn from `Port` table (Phase 2 of the DB plan). Animated dotted line between origin/destination on hover. Becomes a brand signature.

**C2. Trust → proof shift.** Each `TRUST_BADGES` entry replaced with a specific measurable claim and a tooltip linking to the policy that backs it. E.g. "Avg WhatsApp response time: 4 min" pulled from the support log (requires support ticket schema, not yet designed).

**C3. Featured operators logo strip.** "Trusted by N operators" using `Operator.companyName` filtered by `status: ACTIVE`. Logos optional; names sufficient initially.

**C4. Reviews surface integration.** `/reviews` page exists. Pull top-rated 3 routes' worth of reviews onto the home page, link "See all" to the existing page.

---

## Phase D — SEO surface (NOT NOW)

**D1. Destination landing pages.** `/destinations/[slug]` generated at build time per `Port` with active schedules. Hero photo, route grid, top operators, FAQ, weather/travel tips. Replaces home-page "Featured destinations" link target.

**D2. Route landing pages.** `/routes/[origin]-[destination]` per active route pair. Schedule grid, price history sparkline, operator list, route-specific reviews, FAQ. Massive long-tail SEO surface.

**D3. Schema.org structured data.** `Trip`, `Reservation`, `Review`, `LocalBusiness` JSON-LD on home + destination + route pages.

**D4. Blog / guides.** `/guides/[slug]` for evergreen travel content. 10-15 articles, linking into route + destination pages.

---

## Out of scope for this task

- Backend schema changes (Phase A is purely read-side)
- Localisation (B4)
- Mobile native app
- Operator-side changes
- New payment methods, refund policy changes, auth changes
- Anything in Phases B / C / D

---

## How to verify before pushing

```bash
pnpm install
pnpm prisma generate
pnpm typecheck
pnpm seed:qa
pnpm dev                 # then visit http://localhost:3000
```

Walk the home page visually:
1. Hero renders with a real photo, not a gradient
2. Search form still posts to `/search` correctly
3. "Departing today" appears with at least one card from seed data
4. "Popular routes" shows real prices and "N operators" counts
5. Destination cards show photos
6. Reviews carousel rotates
7. Trust strip shows non-zero numbers
8. Lighthouse run from Chrome DevTools clears the thresholds above

If `pnpm seed:qa` doesn't produce enough data for all five sections to render, extend the seed (don't lower the acceptance bar).

---

## Open questions to flag back (do NOT decide unilaterally)

1. **Photo source.** Unsplash (free, commercial OK with attribution) vs paying a photographer for an exclusive set vs operator-supplied photos (already in `Boat.photos`). Recommendation: Unsplash + credits for V1, plan to commission a shoot in Q3. Confirm.

2. **Empty-DB strategy for the reviews carousel.** Hide the section entirely vs render curated "from our pilot users" placeholders. Recommendation: **hide entirely** — placeholder reviews on a launch landing page erode trust faster than they help. Confirm.

3. **ISR cadence vs dynamic.** Page-level `revalidate: 600` is fine for popular routes / reviews / trust numbers, but "Departing today" gets stale by 10 minutes. Recommendation accepted in A3: keep ISR, do client-side countdown re-computation from `departureUtc`. Confirm there's no requirement for the departure list itself to be fresher than 10 minutes (would force `dynamic = "force-dynamic"` and lose CDN caching).

4. **Trust-strip suppression threshold.** "Hide a number when < 10" is a guess. The real product question is "what's the smallest number that builds trust rather than hurting it?" Suggest 100 bookings, 50 reviews, 10 operators. Confirm or adjust.

Flag these in the PR description and wait for review.
