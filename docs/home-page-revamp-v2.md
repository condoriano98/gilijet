# Home Page Revamp V2 — Plan & Requirements

**Audience:** an LLM implementing this without prior context from the planning conversation.
**Read first:** `CLAUDE.md`, `docs/home-page-revamp.md` (V1, already implemented up to Phase A), `app/(customer)/page.tsx`, `components/customer/search-form.tsx`, `lib/destination-photos.ts`, `lib/home-data.ts`, `tailwind.config.ts`, `app/layout.tsx`, `next.config.mjs`.
**Branch:** `claude/boat-ticketing-mvp-YAGl9`.
**Scope of this document:** V2 Phase 1 (broken UX fixes) and V2 Phase 2 (real visual identity) are to be implemented now, as **one PR**. V2 Phases 3 / 4 / 5 / 6 are scoped but **not built** during this task.

---

## Context

V1 Phase A already shipped — real photography registry, live popular routes from DB, departing-soon strip, reviews carousel, authentic trust counter. Code is in `app/(customer)/page.tsx`, `lib/home-data.ts`, `lib/destination-photos.ts`, `components/customer/departing-today.tsx`, `components/customer/reviews-carousel.tsx`. Verified visually via a real screenshot of the rendered page.

**What the screenshot reveals as broken or weak:**
1. The hero photo isn't loading — `picsum.photos` issues a 302 redirect to `fastly.picsum.photos`, which Next/Image rejects because that hostname isn't in `next.config.mjs` `images.remotePatterns`. Result: the hero falls through to the scrim gradient and looks like a solid blue background.
2. The search form defaults `from` and `to` to the same port ("Sanur" → "Sanur") because both pull from `props.origins[0]`. The Search button is then disabled and a fresh visitor sees an obviously-wrong default state.
3. The page reads as a generic OTA — Tailwind `sky-*` palette, centered serif headline, no distinguishing visual identity. Nothing says "Gilijet" specifically.

**Non-goals for this task:** new product features, backend changes, new API surfaces, operator-side work, mobile native, locale switching, destination/route SEO pages. Phase B/C/D from V1 are still on hold.

---

## V2 Phase 1 — Fix what's broken (IMPLEMENT NOW)

Four sub-tasks. Tight scope, no design discretion required.

### 1.1 Hero photo not loading

**Problem.** Picsum redirects break Next/Image. Local photos are the only reliable source.

**Change.** Two-step fix, both required:

1. Commit 10 hand-curated destination photos under `public/destinations/`. File naming must match the slugs in `lib/destination-photos.ts`:

```
public/destinations/hero.jpg              (1920×1080, < 250 KB)
public/destinations/gili-trawangan.jpg    (1600×900, < 200 KB)
public/destinations/nusa-penida.jpg
public/destinations/nusa-lembongan.jpg
public/destinations/lombok.jpg
public/destinations/komodo.jpg
public/destinations/sanur.jpg
public/destinations/padang-bai.jpg
public/destinations/bangsal.jpg
public/destinations/labuan-bajo.jpg
public/destinations/gili-islands.jpg
```

Source the photos from Unsplash (free, commercial OK with attribution) per the open question in V1 — confirmed acceptable. Record the photographer credit in `lib/destination-photos.ts` `credit` field for each entry.

2. Rewrite `lib/destination-photos.ts` to reference `/destinations/<slug>.jpg` instead of the picsum placeholder URL:

```ts
const LOCAL = (slug: string) => `/destinations/${slug}.jpg`;

export const DESTINATION_PHOTOS: Record<string, DestinationPhoto> = {
  "gili-trawangan": { url: LOCAL("gili-trawangan"), alt: "...", credit: "Photographer Name on Unsplash" },
  ...
};

export const HERO_PHOTO: DestinationPhoto = {
  url: LOCAL("hero"),
  alt: "Indonesian fast boats heading to the Gili Islands at sunrise",
};
```

**Do NOT** keep the picsum URLs as fallback. Local-only.

**Also remove** `picsum.photos` from `next.config.mjs` `images.remotePatterns` since it's no longer used. Leave `images.unsplash.com` so future operator photos can hotlink.

**Acceptance.**
- Hero photo visible on the rendered page (not just the gradient scrim).
- All four destination cards in "Explore Indonesia by sea" show real photos.
- Each popular-routes thumbnail (the 56px circle) shows the destination photo.
- Every `DESTINATION_PHOTOS` entry has a non-empty `credit` field.
- Lighthouse SEO ≥ 95 — alt text present on every image.

---

### 1.2 Same-port search default

**Problem.** `components/customer/search-form.tsx:36-38` defaults `destination` to `props.destinations[0]` which equals `props.origins[0]`. The visible state is "Sanur → Sanur" with a disabled Search button.

**Change.**

In `components/customer/search-form.tsx`, change the destination default from `props.destinations[0]` to `props.destinations[1] ?? ""`:

```ts
const [destination, setDestination] = React.useState(
  props.defaultDestination ?? props.destinations[1] ?? "",
);
```

If `props.destinations` has only one entry, fall back to empty string. The first option in the rendered `<select>` should be a disabled placeholder when destination is empty:

```tsx
<select
  id="destination"
  value={destination}
  onChange={(e) => setDestination(e.target.value)}
  ...
>
  <option value="" disabled>Pick a destination</option>
  {props.destinations.map((p) => (
    <option key={p} value={p} disabled={p === origin}>
      {p}
    </option>
  ))}
</select>
```

The `disabled={p === origin}` on each option also prevents picking the current origin as destination from the dropdown.

Mirror the same pattern on the origin select (placeholder "Pick a departure port", disable destinations[0] options matching current `destination`).

**Acceptance.**
- Initial render: From = "Sanur", To = "Padang Bai" (or first valid pair); Search button enabled.
- Picking the same port on both sides is impossible (the matching option is disabled).
- "Swap" button still works after the change.
- Fresh visitor lands on a working search bar with no clicks required.

---

### 1.3 Date picker upgrade

**Problem.** `<Input type="date">` falls through to the native browser date input, which is inconsistent across browsers, ugly on iOS, and breaks the visual identity work in Phase 2.

**Change.** Adopt `react-day-picker` (already shadcn-friendly). Steps:

1. `pnpm add react-day-picker date-fns` (date-fns is the v8 peer dep).
2. Build a small `components/ui/date-picker.tsx` wrapping `react-day-picker` inside `components/ui/popover.tsx`. Display format: `dd MMM yyyy` (e.g. "12 Jun 2026"). Selected value emitted as ISO `yyyy-MM-dd` to match what the form already submits.
3. Replace `<Input id="date" type="date" ...>` in `search-form.tsx` with `<DatePicker value={date} onChange={setDate} minDate={today()} />`. Same for `returnDate`.
4. Keep keyboard accessibility — `Enter` opens the calendar, arrow keys navigate, `Esc` closes.

**Acceptance.**
- Native date input no longer renders.
- Calendar opens on click and on `Enter` when the trigger is focused.
- Visual style matches the rest of the form (shadcn-consistent).
- Selected date roundtrips correctly to `/search?date=YYYY-MM-DD`.
- Works on mobile Safari (where the native picker is particularly bad).

---

### 1.4 Promo banner overlap check

**Problem.** When `getDepartingSoon()` returns empty, the promo banner gets `-mt-12` to overlap the hero. On a real page render this may look fine, but the screenshot suggests the visual is awkward when paired with the gradient-only fallback hero.

**Change.** Once Phase 2 (the new hero) lands, re-test the empty-departures case. If the promo card visually clips the hero, change the conditional in `app/(customer)/page.tsx:131` from:

```tsx
<section className={`container mb-12 ${hasDepartures ? "" : "-mt-12"}`}>
```

to:

```tsx
<section className="container mt-8 mb-12">
```

i.e. give the promo banner a fixed positive top margin regardless of whether the departing-soon section is mounted.

**Acceptance.**
- No visual collision between the hero's bottom edge and the promo card.
- Same vertical rhythm whether or not the departing-soon section is rendered.

---

## V2 Phase 2 — Real visual identity (IMPLEMENT NOW)

Four sub-tasks. Establishes that Gilijet looks like Gilijet, not a generic OTA template.

### 2.1 Color palette

**Problem.** Page uses Tailwind's stock `sky-*` palette. Indistinguishable from every other ferry / OTA site.

**Change.** Extend `tailwind.config.ts` with two custom colors:

```ts
extend: {
  colors: {
    gilijet: {
      deep: "#0a3d62",    // primary brand — deep Indonesian Ocean
      ocean: "#1e6091",   // 1-shade-lighter for hover states
      foam: "#e8f4fa",    // very-light background tint
      coral: "#ff9a3c",   // sunset accent — CTAs only, use sparingly
      coralDeep: "#e88528", // coral hover
    },
  },
},
```

**Apply.** Global replacements in `app/(customer)/page.tsx`:
- `bg-sky-600` → `bg-gilijet-deep`
- `text-sky-700` → `text-gilijet-deep`
- `text-sky-50` → keep (these are on dark backgrounds and white-ish is right)
- `from-sky-900/85 via-sky-700/75 to-cyan-600/70` → `from-gilijet-deep/85 via-gilijet-ocean/75 to-gilijet-deep/60` (the hero scrim)
- `bg-sky-50` (How it works section) → `bg-gilijet-foam`
- CTA buttons in promo banner: `bg-amber-600 hover:bg-amber-700` → `bg-gilijet-coral hover:bg-gilijet-coralDeep`

**Do NOT** mass-replace `sky-*` across the entire codebase — only the home page and its components. Other surfaces (operator portal, admin) are out of scope.

**Acceptance.**
- Every `sky-*` reference in `app/(customer)/page.tsx`, `components/customer/departing-today.tsx`, and `components/customer/reviews-carousel.tsx` either maps to `gilijet-*` or is intentionally preserved (with a comment).
- Coral is used **only** on primary CTAs (promo "Book now", main search button if Phase 2.4 hero rework touches it). Never on body text, never on hover states for non-CTA links.

---

### 2.2 Typography

**Problem.** Default fonts; nothing distinctive.

**Change.** Adopt Plus Jakarta Sans for the display layer, keep the existing system font for body. PJS has full Indonesian glyph support and was designed in Jakarta, so the local-relevance is real and not affected.

In `app/layout.tsx`:

```ts
import { Plus_Jakarta_Sans } from "next/font/google";

const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

// in the body:
<body className={`${displayFont.variable} ...`}>
```

Extend Tailwind:

```ts
extend: {
  fontFamily: {
    display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
  },
},
```

Apply `font-display` to all `<h1>`, `<h2>`, `<h3>` on the home page only. Body and form copy stay with the default sans.

**Acceptance.**
- Headlines render in Plus Jakarta Sans (verify in DevTools).
- No layout shift from font swap (`display: swap` + `variable` font CSS handles this).
- Lighthouse Performance ≥ 80 — the font load is async and doesn't block first paint.

---

### 2.3 Wave section dividers

**Problem.** Section boundaries on the page are hard `bg-slate-50` / `bg-gilijet-foam` blocks. Reads as utilitarian.

**Change.** Add a single reusable SVG wave divider component:

```tsx
// components/ui/wave-divider.tsx
export function WaveDivider({
  fillClass = "fill-white",
  flipped = false,
}: {
  fillClass?: string;
  flipped?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 1440 60"
      preserveAspectRatio="none"
      className={`block w-full h-8 sm:h-12 ${flipped ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path
        className={fillClass}
        d="M0,30 C240,60 480,0 720,30 C960,60 1200,0 1440,30 L1440,60 L0,60 Z"
      />
    </svg>
  );
}
```

Mount between sections where the background colour changes:
- After the hero, before the "departing soon" / promo banner — fill matches the next section's background.
- Between "Explore Indonesia by sea" (slate-50) and the reviews section (white) — fill matches white.
- Between "How it works" (gilijet-foam) and "Operator CTA" (white) — fill matches white.

**Acceptance.**
- Three wave dividers visible at section boundaries.
- No vertical gaps or overlaps where a divider meets the next section.
- SVG is inlined (no extra HTTP request).

---

### 2.4 Hero variant: full-bleed photo + overlapping search

**Problem.** Current hero is centered text on a gradient. Stock OTA shape.

**Change.** Rebuild the hero `<section>` in `app/(customer)/page.tsx` to:

1. **Photo brightness reduced to ~60%** via the scrim. Scrim should be a single dark gradient `from-gilijet-deep/70 via-gilijet-deep/50 to-transparent` going **left-to-right**, not corner-to-corner. Leaves the right side of the photo more visible.

2. **Left-aligned headline**, max-width `36ch`. Move the existing centered text:

```tsx
<div className="mx-auto max-w-6xl">
  <div className="max-w-2xl">
    <Badge>Indonesia's #1 boat ticketing platform</Badge>
    <h1 className="mt-4 text-4xl font-display font-extrabold text-white drop-shadow sm:text-5xl lg:text-6xl">
      Island-hop with confidence
    </h1>
    <p className="mt-4 text-lg text-white/90 drop-shadow sm:text-xl max-w-prose">
      Book verified fast boats and ferries across Indonesia.
      Pay your way, get e-tickets instantly.
    </p>
  </div>
</div>
```

3. **Search card overlaps the bottom of the hero** by `translateY` rather than negative margin (cleaner for the wave divider). Hero gets `pb-32 sm:pb-40` to make room. Search card sits in its own container with `-translate-y-1/2` and `max-w-5xl`. The wave divider goes **behind** the search card (lower z-index).

4. **Photo credit** in the bottom-right corner of the hero, small white/70 text: "Photo by {credit}". Pull from `HERO_PHOTO.credit`.

5. Keep the existing `Badge`, just change its background to `bg-gilijet-coral/20 text-white border-white/20` so the brand coral makes a small first appearance.

**Do NOT** add hero animations, parallax, or video backgrounds. Static photo only — perf budget says no.

**Acceptance.**
- Headline left-aligned, max ~2 lines on desktop.
- Photo visible behind the scrim (not the solid blue from the screenshot).
- Search card visibly straddles the hero/content boundary.
- Wave divider sits between hero and content but doesn't cover the search card.
- Photo credit visible bottom-right of hero.
- Mobile (375px width): headline doesn't overflow, search card collapses to single-column form, photo crops to a flattering centre.

---

## V2 Phase 1+2 deliverable checklist

- [ ] 10 photos committed under `public/destinations/` matching the slug pattern, each < 200 KB (hero < 250 KB)
- [ ] `lib/destination-photos.ts` rewritten to reference local paths with `credit` populated on every entry
- [ ] `next.config.mjs` `picsum.photos` removed from `remotePatterns`; `images.unsplash.com` retained
- [ ] `components/customer/search-form.tsx` defaults destination to a different port + adds disabled placeholder option + disables same-port options in both selects
- [ ] `pnpm add react-day-picker date-fns`
- [ ] `components/ui/date-picker.tsx` created; replaces both `<Input type="date">` instances in `search-form.tsx`
- [ ] Promo banner top margin reviewed in the no-departures case
- [ ] `tailwind.config.ts` extended with `gilijet.deep / ocean / foam / coral / coralDeep`
- [ ] All `sky-*` references in `app/(customer)/page.tsx`, `components/customer/departing-today.tsx`, `components/customer/reviews-carousel.tsx` mapped to `gilijet-*` per the rules in 2.1
- [ ] Plus Jakarta Sans loaded via `next/font/google` in `app/layout.tsx`; `font-display` Tailwind utility applied to home-page H1/H2/H3 only
- [ ] `components/ui/wave-divider.tsx` created; mounted at three section boundaries on the home page
- [ ] Hero rebuilt per 2.4 — left-aligned, scrim, overlapping search card, photo credit
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` no new warnings
- [ ] `pnpm seed:qa` runs and the rendered home page shows all sections populated
- [ ] Lighthouse on the home page: Performance ≥ 80, Accessibility ≥ 95, SEO ≥ 95
- [ ] Visual walk-through done at 375px (mobile), 768px (tablet), 1440px (desktop)
- [ ] Commit message: `feat(home): v2 phase 1+2 — broken UX fixes + visual identity`
- [ ] Push to `claude/boat-ticketing-mvp-YAGl9`

---

## V2 Phase 3 — Above-the-fold proof (NOT NOW)

Designed; do not build during this task.

**3.1 Live one-liner above the hero headline.** Single rotating pill: "Next boat to Gili Trawangan in 23 min · 6 seats · IDR 425k". Rotates every 5s through entries from `getDepartingSoon()`. Empty state: hide.

**3.2 Operator logos strip below the search.** Real `Operator.companyName`s for `status: ACTIVE, deletedAt: null`. Logos optional initially. Replaces the current "Search across 50+ operators" hardcoded subtext.

**3.3 Trust strip relocation.** Move the threshold-gated numbers from `getTrustNumbers()` out of the footer into a slim bar between hero and promo banner. Footer keeps the "Secure, verified, regulated" badges row only.

---

## V2 Phase 4 — Mobile-first reflow (NOT NOW)

**4.1 Bottom-sheet search.** On mobile (< 640px), hero shows a single "Find boats" CTA. Tap opens a full-screen bottom sheet with the search fields (use a `vaul`-style drawer or build with shadcn primitives).

**4.2 Persistent next-departure pill.** Pinned to the bottom of the viewport on mobile, links to `/book/[legId]`. Hides on scroll up past hero; reappears on scroll down.

**4.3 Destination carousel.** Replace the 4-column grid with a horizontal snap-carousel on mobile. Use existing CSS `snap-x snap-mandatory` pattern from `components/customer/departing-today.tsx`.

---

## V2 Phase 5 — Indonesian-native touches (NOT NOW)

**5.1 EN / ID toggle** in the header. `next-intl`. Default locale inferred from `Accept-Language`.
**5.2 Localised relative time** ("23 menit lagi" in ID mode) extending the existing `lib/datetime.ts`.
**5.3 Batik motif overlay** on the Operator CTA card. Single low-opacity SVG pattern, < 5 KB.

---

## V2 Phase 6 — Help-me-decide mode (NOT NOW)

**6.1 Hero toggle.** Two pill buttons at the top of the hero: "I know my route" (current search) and "Help me decide" (destination chooser).

**6.2 Destination chooser.** 4 huge destination tiles ("Beach hopping in the Gilis", "Cliffs of Nusa Penida", "Mount Rinjani via Lombok", "Komodo expedition") with photos and 1-line copy. Click → `/destinations/[slug]` (requires Phase D of V1 plan — not built).

**6.3 Persistence.** Remember the user's last choice in `localStorage`.

---

## Out of scope for this task

- New product features
- Backend changes / new API surfaces
- Operator-side and admin-side work
- Phases 3 / 4 / 5 / 6 of this document
- Localization beyond what's already in `lib/datetime.ts`
- Destination / route SEO landing pages (V1 Phase D)
- Loading new fonts other than Plus Jakarta Sans
- Animation libraries (Framer Motion etc.) — CSS transitions only
- Replacing the existing shadcn primitives — extend, don't replace

**Explicit DO NOTs informed by past scope creep:**
- Do not invent new "phases" beyond what's in this document.
- Do not create new top-level config files (`.eslintrc.json`, `.opencode/...`, etc.).
- Do not introduce orchestration scaffolding (`.claude/commands/`, `scripts/worker.sh`, etc.).
- Do not write a parallel requirements document; if you find a need that isn't covered here, **flag it back** rather than adding it.
- Do not edit `CLAUDE.md`.

---

## How to verify before pushing

```bash
pnpm install
pnpm prisma generate
pnpm typecheck
pnpm lint
pnpm seed:qa
pnpm dev   # then visit http://localhost:3000
```

Visual walkthrough:
1. Hero photo loads (not a solid blue gradient).
2. Headline is left-aligned, Plus Jakarta Sans, white on darkened photo.
3. Search card sits half on the hero, half on the content area.
4. Initial form state: From = Sanur, To = Padang Bai (or first different pair).
5. Clicking the date field opens a calendar, not the native picker.
6. Picking the same value on From and To is impossible.
7. Wave dividers visible between hero/content, content/destinations, how-it-works/operator-CTA.
8. "Departing soon" strip appears if seed has near-future legs.
9. Popular routes show real prices and "N operators".
10. Destination cards show photos.
11. Reviews carousel rotates every 6s; pause on hover.
12. Trust strip suppression behaves correctly with the seeded counts.
13. Mobile (375px): hero stacks, search form single-column, photos crop centre.

Lighthouse thresholds (Chrome DevTools, mobile profile): Performance ≥ 80, Accessibility ≥ 95, SEO ≥ 95.

---

## Open questions to flag back (do NOT decide unilaterally)

1. **Photo source confirmation.** V1 open question recommended Unsplash; this plan assumes the same. Confirm before committing 10 photos to the repo — Unsplash terms require attribution in `credit`. If preferred source has changed (paid photographer, operator-supplied), say so and the executor swaps the URLs only.

2. **Brand palette.** Deep navy (`#0a3d62`) + sunset coral (`#ff9a3c`) is one defensible direction. If marketing / design has a different palette confirmed, supply the hex values and the executor swaps. Do not invent palette discussion in the implementation.

3. **Display font.** Plus Jakarta Sans is recommended. Alternatives that work: Manrope (more neutral), Sora (more modern), Inter (safest). If you prefer one, say so; the executor swaps the `next/font/google` import only.

4. **Promo banner copy.** Hardcoded `GILIJET15`, "Save 15% on Gili Islands routes", "Book before 31 May 2026" date is in the past as of mid-2026. Should the promo banner be deleted entirely, made dynamic from the `Promotion` table, or just have its dates updated? Recommend: pull from `Promotion` table where `isActive: true AND expiresAt > now()`, render the most recent. If empty, hide. (This may grow scope — flag if not desired.)

5. **Hero photo licensing for `public/`.** Committing photo binaries to git inflates clone size. Alternative: serve via Supabase Storage (`**.supabase.co` is already in remotePatterns) and reference the storage URL in the registry. Recommend `public/` for V1 simplicity; flag if repo size is a concern.

Flag these in the PR description and wait for review.
