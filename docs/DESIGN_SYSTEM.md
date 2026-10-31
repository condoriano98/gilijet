# Gilifast design system (customer site)

Written from what exists in the repo plus the redesign canvas (https://claude.ai/artifact/4tNvB86LSXa7WmB3wvn9H7). Scope: the customer surface under `src/app/(customer)/`. Operator and admin keep the Mekari palette and are not redesigned. The redesign plan and the per-page tracker live in `docs/spikes/in-progress/FEATURE_UI_UX_AGENT.md`.

Status: stage 0 (2026-10-31). Sections marked *to confirm* come from the canvas and were not measured in a browser yet.

## 1. Colour

Customer pages sit inside `.gj-brand` (`src/app/(customer)/layout.tsx`), which remaps the shadcn semantic variables to the brand. Tokens are defined in `tailwind.config.ts` (`brand.*`) and `src/app/globals.css`.

| Role | Token | Hex | Use |
|---|---|---|---|
| Primary | `brand` (`bg-brand`, `text-brand`) | `#103BE9` | CTAs, links, selected states, logo |
| Primary dark | `brand-dark` | `#00228E` | hover, headings on a tint, column titles in the footer |
| Accent | `brand-cyan` | `#00AEEF` | secondary highlight, used sparingly |
| Tint | `brand-periwinkle` | `#E1E7FF` | badges, selected chips, hover fill |
| Surface | `brand-surface` | `#F2F5FF` | footer, quiet sections, hover on ghost buttons |
| Line | `brand-line` | `#DDE2F0` | borders and dividers on white or surface |
| Text | `brand-text` | `#333844` | nav and body text on white |
| Muted | `brand-muted` | `#4B5365` | secondary text (contrast on `brand-surface` to confirm) |
| Ink | `brand-ink` | `#1F1F1F` | headings |

Rules:
- Inside primitives use the semantic classes (`bg-primary`, `text-muted-foreground`, `border-border`); use `brand-*` for page-level blocks.
- No hex value in a page. If a colour is missing, add a token here first.
- `mekari-*` is operator and admin only.
- **Deprecated:** `gilifast-deep|ocean|foam|coral` and `--gj-*` are legacy aliases that older pages still use. They are removed in the last stage, when `git grep -n "gilifast-foam\|fill-gilifast" -- "src/app/(customer)"` returns nothing.
- Dropped from the design: the amber banner, the dark slate block, the blue utility bar above the header, the wave dividers and the footer wave band.

## 2. Type

Inter (400-800), loaded in `src/app/layout.tsx` as `--font-display`; `font-sans` and `font-display` both use it. Scale *to confirm*: display 36/40 (800), h1 30/36 (700), h2 24/32 (700), h3 18/28 (600), body 16/24, small 14/20, caption 12/16. Prices and times use `tabular-nums`. One `h1` per page.

## 3. Spacing and layout

- Container: `container` (centred, 1rem padding, max 1280 px).
- Spacing scale on a phone (390 px artboards, loosened at the owner's request): side gutters 20 px; 48-56 px between sections (40 px between numbered legal sections); card padding 20-24 px; 16 px inside a card or list and between cards; form fields 18-20 px apart; body text 15-16 px.
- Desktop (1440 px artboards): side padding 64 px, section rhythm 72-88 px.
- Tailwind 4 px scale only. No arbitrary pixel values unless a token is missing.

## 4. Shape and elevation

`--radius` is 0.625rem under `.gj-brand`. `rounded-pill` for CTAs and chips, large cards use 24-32 px radius on the artboards. `shadow-ambient` for cards, `shadow-ambient-sm` for list rows. Borders use `brand-line`.

## 5. Components

Shared primitives are in `src/shared/ui/` (shadcn style on Radix, lucide icons): badge, button, card, checkbox, counter, data-table, date-picker, dialog, empty-state, grouped-port-select, input, kpi-card, label, money-input, popover, select, sheet, status-badge, table, textarea, wave-divider. Reuse before writing markup; extend a variant instead of copying a primitive.

Customer chrome (stage 0), in `src/app/(customer)/_components/`:
- `SiteHeader` (`site-header.tsx`): white sticky header, logo, Blog, Find booking, `AuthNav`, "Book now", `MobileNav`. Below `sm` only "Book now" and the menu render (a full row is wider than a phone).
- `SiteFooter` (`site-footer.tsx`): `brand-surface` footer, four columns (brand and payment partners, Company, Legal, Support), cookie settings link, copyright and DOKU line.
- `MobileNav`, `AuthNav`, `Logo`, `PaymentPartners`: unchanged behaviour.

The home hero (stage 1) is written in `[locale]/page.tsx` and is not a shared component yet: no second page uses it. Extract it when one does. The legal-page layout is built in stage 5 (terms). Home patterns now in use: inset hero `rounded-[32px]` with a blue scrim, floating card `rounded-[28px] shadow-ambient`, section title `text-[34px] font-extrabold`, route rows with a periwinkle arrow, bento tiles `rounded-[28px]`, blue band `bg-brand-dark rounded-[32px]`.

## 6. Do not touch (kept contract)

Form field names, `id`s, `data-testid`s, hidden inputs, server-action bindings, redirects, `TrackEvent`, the consent banner and the GTM loader (`MarketingTags`), money and time helpers. Full contract: "Rules for every page" in the UI/UX spike.

## 7. Accessibility floor

WCAG 2.2 AA: 4.5:1 text contrast, visible focus ring, 44 px touch targets on a phone (guarded by `MOB-004` in `tests/e2e/mobile-sweep.spec.ts` for routes in `REDESIGNED_ROUTES`), a label on every field, `aria-label` on icon-only buttons.

## 8. Brand and voice

Logo: `src/app/(customer)/_components/logo.tsx` (speedboat mark above "GILIFAST.com", single colour). Voice: concise, plain English, no exclamation marks. Prices in Rp with thousands dots, times in WITA. The hero image is `public/brand/hero-home.png`. The Figma source is not linked in the repo (owner to provide).

## 9. Checking a change

At 375, 768 and 1280 px: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, the Playwright suite (`docs/qa-runs/README.md`), and a look in `pnpm dev`. Visual regression tooling (Percy, Chromatic) and Storybook are not set up.
