# Feature: AI agent for UI/UX development (prep for the post-Phase-1 redesign)

**Status (2026-10-30):** planned, not started. Waiting for "implement". Nothing in this doc changes app code.
**Created:** 2026-10-30
**Target version:** `[Unreleased]` (agent definition, docs, one pilot page). The pilot page is a user-visible change, so it ships as a MINOR/PATCH of its own only if the owner decides to release it (see "Pilot").
**Hard constraint from the ticket:** no large redesign before Phase 1 is declared finished. Only the setup and one small pilot happen now. The pilot goes to `staging` only and is not merged to `main` until the owner says so.

## Design exploration (draft, 2026-10-30): waiting for the client

Before building the agent, a home page redesign draft was made so the team and the client can pick a direction. It is a mockup only: nothing under `src/` changed.

- **Canvas (private artifact, owner can share):** https://claude.ai/artifact/4tNvB86LSXa7WmB3wvn9H7
- **Contents:** 4 artboards: current home desktop (screenshot from local dev against the staging DB), proposed desktop, current mobile (top of page), proposed mobile.
- **Direction proposed:** white and blue only (brand `#103BE9`, dark `#00228E`, periwinkle `#E1E7FF`, cyan accent). Real destination photo hero with a blue overlay and a floating white search card; bento grid for destinations; one blue band for "Why Gilifast"; no repeated wave dividers; the amber banner and the dark slate block removed.
- **Not final:** Departing soon times and operator names are sample data; the blog block and payment-partner logos are left out of the mockup and need a place in the final design; contrast and a real browser check were not done.
- **Open decisions for the client:** photo vs the current illustration in the hero; bento grid vs uniform cards for destinations; whether the blog stays on the home page.
- **Next once a direction is chosen:** update this doc (pilot page, `DESIGN_SYSTEM.md` contents), then wait for "implement".

## Why

After Phase 1 the team wants a more attractive look. An agent that already knows the brand, the tokens and the no-touch zones makes the redesign faster and keeps pages consistent. Today the repo has `.claude/agents/ui-polisher.md`, but it only covers spacing, copy and a11y after a feature lands. There is no written design system, no rule for what a redesign may not touch, and no review gate for visual work.

## What exists today (checked in the repo, 2026-10-30)

- **Agents** (`.claude/agents/`): `feature-builder`, `ui-polisher` (Sonnet, presentational only), `persona-tester`, `e2e-flow-runner`, `typecheck-gate`, `code-reviewer`, and others. `ui-polisher` is the nearest thing to a UI agent.
- **Tokens**, two sources that repeat each other:
  - `src/app/globals.css`: shadcn HSL variables (`--primary`, `--secondary`, `--accent`, `--muted`, `--border`, `--ring`, `--radius`), the Mekari palette (`--mekari-*`, operator and admin), and the Gilifast consumer palette (`--gj-*`). `.gj-brand` remaps the semantic layer to the brand (primary 228 87% 49%, secondary cyan, accent periwinkle, radius 0.625rem).
  - `tailwind.config.ts`: `brand` (`#103BE9` / dark `#00228E` / cyan `#00AEEF` / periwinkle `#E1E7FF` / ink `#1F1F1F`), legacy `gilifast.*` (deep, ocean, foam, coral), `mekari.*`, `pill` radius 44px, `shadow-ambient` and `shadow-ambient-sm`.
- **Type**: Inter (400-800) loaded in `src/app/layout.tsx` as `--font-display`; both `font-sans` and `font-display` point at it.
- **Primitives** (`src/shared/ui/`): badge, button, card, checkbox, counter, data-table, date-picker, dialog, empty-state, grouped-port-select, input, kpi-card, label, money-input, popover, select, sheet, status-badge, table, textarea, wave-divider. shadcn-style on Radix, lucide icons, Tailwind only.
- **Surfaces**: customer (`src/app/(customer)/[locale]/…`, localized en/id/ja/zh, brand palette), operator and admin (not localized, Mekari palette). The redesign is about the customer surface unless the owner says otherwise.
- **Checks that already guard UI**: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, Playwright specs including `customer-booking`, `round-trip-booking`, `mobile-layout`, `tab-branding`.
- **Staging**: Vercel project `gilifast`, custom environment `staging`, with a deployment protection bypass (see memory note on staging temp config).

Gaps found: the brand hex values live in two files; the `gilifast.*` and `brand.*` colours overlap; there is no written spacing scale, type scale or component usage guide; the Figma source of truth is referenced in comments but not linked anywhere in the repo.

## 1. Agent role

**Name (proposed):** `ui-designer`, a new file `.claude/agents/ui-designer.md`. `ui-polisher` stays as the small post-feature pass; `ui-designer` is the redesign agent. (Alternative: extend `ui-polisher`. Rejected for now because the redesign needs a wider remit and a stricter no-touch list than a polish pass.)

**Does**
- Produces a mockup first: a static HTML/Tailwind preview or a screenshot of the page in the running app, shown to a human before code changes spread.
- Builds and restyles presentational components (customer surface) from the design system.
- Fixes layout: responsive breakpoints, spacing, hierarchy, sticky CTAs, empty and loading states.
- Reviews consistency: finds hard-coded colours, off-scale spacing, duplicated variants, missing focus rings and contrast failures, and reports or fixes them.
- Updates Playwright selectors and tests when a visible label or structure changes, in the same change.

**Does not (hard limits)**
- No change to business logic. Never edits `src/features/**` (except purely presentational files under `src/features/*/components/`, and only their markup and classes), `src/shared/server/**`, `prisma/**`, `src/app/api/**`, `proxy.ts`, server actions, Zod schemas, auth guards, cron or webhook routes.
- No change to the **protected flows** without an explicit task naming them: seat hold and confirm (`booking/engine`), price computation (`pricing/**`), payment redirect and gateway callbacks (`payments/**`), ticket issuing and QR (`tickets/**`), refunds. The agent may restyle the *pages* of these flows but must keep every form field name, `name`/`id`, `data-testid`, hidden input, redirect and server-action binding intact.
- No new top-level libraries (CLAUDE.md "Don't"). No CSS Modules or styled-components.
- No new colours, fonts or radii outside the design system; if one seems needed the agent proposes it in the PR description instead of adding it.
- No copy changes in translations beyond the English source without flagging that `id`, `ja`, `zh` need an update (`src/messages/`).
- No commit, push or merge on its own (CLAUDE.md rule 5; `main` rule 9 applies).

## 2. Tools, model, access

- **Model:** Sonnet-class for routine restyling and consistency sweeps (same as `ui-polisher`, cheaper and fast). Use the most capable model for the first design direction and for any page in the protected flows. Set per task, not hard-coded, except the default `model:` in the agent file.
- **Tools (agent file):** `Read, Edit, Write, Bash, Grep, Glob`. No Prisma or DB tools. Playwright via `pnpm` for screenshots.
- **Repo access:** works in a branch or worktree off `staging`; never on `main`. Reads `STRUCTURE.md`, `CLAUDE.md` and the design system doc first.
- **Seeing the result:** (a) local `pnpm dev` plus Playwright screenshots at 375, 768 and 1280 px; (b) the Vercel staging deployment of the branch, opened with the bypass already configured for staging. The agent reads staging; it does not change Vercel settings or env vars.
- **Not given:** `.env.prod`, production URLs for anything but a plain public page view, DB credentials, the Supabase and Vercel write tools.
- **Open choice:** whether to also use a design tool (Figma/Canva connector) for mockups. Default proposal: no, HTML/Tailwind mockups only, because the connectors would add an account and a second source of truth.

## 3. Base design system (the agent's reference)

New doc `docs/DESIGN_SYSTEM.md`, written from what already exists, not invented. Contents:

1. **Colour roles** (customer): primary `#103BE9` (CTAs, links, selected states), primary dark `#00228E` (hover, headings on tint), cyan `#00AEEF` (secondary accent, highlights), periwinkle `#E1E7FF` (tinted surfaces, badges), ink `#1F1F1F` (text), grays `#828282` / `#F2F2F2` / `#F9F9F9`, success `#0E9E4D`, destructive from `--destructive`. Rule: use semantic classes (`bg-primary`, `text-muted-foreground`, `border-border`) inside primitives; use `brand.*` only for marketing blocks. Mekari palette is operator/admin only.
2. **Deprecated tokens:** `gilifast.*` colours are legacy aliases; new code uses `brand.*`. The redesign decides whether to remove them.
3. **Typography:** Inter. Proposed scale to confirm with design: display 36/40 (800), h1 30/36 (700), h2 24/32 (700), h3 18/28 (600), body 16/24 (400), small 14/20, caption 12/16. Numbers in prices and times use `tabular-nums`.
4. **Spacing and layout:** Tailwind 4-px scale only; container padding 1rem, max 1280px; section rhythm `py-12 md:py-16`; mobile first.
5. **Shape and elevation:** radius from `--radius` (0.625rem under `.gj-brand`), `rounded-pill` for chips and CTAs, `shadow-ambient` for cards and `shadow-ambient-sm` for list rows.
6. **Components:** one entry per primitive in `src/shared/ui/` (when to use, variants, do/don't), plus the customer composites (`BookingProgress`, `WaveDivider`, port select, date picker, counter).
7. **Brand:** Gilifast logo and the speedboat icon (`src/app/_components/brand-icon.tsx`), voice (concise, plain English, no exclamation marks, prices in Rp with thousands dots, times in WITA), photography rules for destination images.
8. **Accessibility floor:** WCAG 2.2 AA contrast (4.5:1 text), visible focus ring, 44 px touch targets on mobile, labels on every field, `aria-label` on icon buttons.
9. **Figma:** link the Figma file the tokens came from (owner to provide; not found in the repo).

The agent file tells the agent to read this doc first and to cite the section when it deviates.

## 4. Workflow

1. **Request**: a ticket or chat message naming the page, goal, and any reference. Scope is one page or one component family per request.
2. **Spike**: the agent writes (or updates) a spike doc under `docs/spikes/` with scope, protected elements on the page, and the verification plan (repo rule). Waits for "implement".
3. **Mockup**: screenshot or static preview at three widths. A human approves the direction (comment or "ok").
4. **Build**: branch off `staging` (`ui/<page>`). Presentational edits only. Playwright selectors kept or updated.
5. **Self-checks**: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, the relevant e2e specs (booking-related pages always run `customer-booking`, `round-trip-booking`, `mobile-layout`), a diff check that no file outside the allow-list changed.
6. **Review (human)**: PR to `staging` with before/after screenshots at 375/768/1280, the list of touched files, the protected-element checklist, and the checks run. A human reviewer approves. `code-reviewer` and `persona-tester` may run first but do not replace the human.
7. **Staging**: merge to `staging`, Vercel deploys, a human clicks the booking flow once with the 1-rupiah / mock payment path before sign-off.
8. **Production**: only via the normal PR `staging` → `main` (`docs/RELEASING.md`, CLAUDE.md rule 9). The agent never opens or merges it unasked.
9. **Rollback**: each page lands as its own commit/PR so it can be reverted alone.

## 5. Prompt and instruction guidelines (go into `ui-designer.md`)

- Read `CLAUDE.md`, `STRUCTURE.md`, `docs/DESIGN_SYSTEM.md` before any edit.
- Allow-list of paths it may edit: `src/app/(customer)/**` (markup and classes), `src/app/_components/**`, `src/shared/ui/**`, `src/features/*/components/**`, `src/app/globals.css`, `tailwind.config.ts`, `tests/e2e/**` and `tests/unit/app/**` for selector updates, `docs/**`. Anything else needs the task to say so.
- Keep all `name`, `id`, `data-testid`, `aria-*` used by tests, form bindings and server-action wiring; grep for them before moving or removing markup.
- Reuse a primitive before writing new markup; extend a primitive's variants rather than copying it.
- Never hard-code a hex value in a page; use tokens.
- Do not remove loading, error, empty or disabled states while restyling.
- Money, dates and times are rendered through the existing helpers (`shared/lib/datetime`, pricing display helpers); the agent restyles, it does not reformat.
- Every change is checked at 375 px first.
- End every task with: files changed, protected elements touched (should be "none"), checks run and results, what it could not verify.
- If a request seems to need a logic change, stop and ask.

## 6. Pilot (small trial on one page)

**Proposed page:** the search results page `src/app/(customer)/[locale]/search/` (read-only for the user until they pick a leg, so lower risk than `book/[legId]`). Booking page is the second candidate once the flow is proven.

Steps: write the agent file and the design system doc → run the workflow above on the search page → deploy to staging → run `customer-booking`, `round-trip-booking`, `mobile-layout` → record the result in this doc.

Validate: the agent produced a change that runs on staging; the diff touched only allowed paths; no test needed a logic change; a human review happened; time and rework needed. The pilot is not merged to `main` until Phase 1 is done and the owner agrees.

Do the pilot after the round-trip price fix is verified on staging, because the search page now shows per-leg round-trip prices and a restyle must not hide or reformat them.

## 7. Proposed redesign plan after Phase 1

Priority by traffic and revenue path; each stage is a separate PR and release.

| Stage | Scope | Notes |
|---|---|---|
| 0 | Design tokens cleanup, `docs/DESIGN_SYSTEM.md` final, primitives refreshed | No page changes; visual regression baseline taken |
| 1 | Home (`[locale]/page.tsx`), header, footer, mobile nav | Highest traffic; marketing consent banner and GTM must keep working |
| 2 | Search results and filters | Pilot learnings applied |
| 3 | Booking form (`book/[legId]`), passenger step | Protected flow: engine and pricing untouched |
| 4 | Checkout and pay (`checkout`, `pay`) | Protected flow: full payment test on staging before sign-off, DOKU one-rupiah path |
| 5 | Booking lookup and e-ticket page (`b/[reference]`), boarding pass print | Protected: QR and print layouts |
| 6 | Account, refunds, reviews, change-plans | |
| 7 | Content pages: about, contact, blog, terms, privacy, best-price-guarantee | Privacy page text needs owner review separately |
| 8 | Operator and admin | Only if the owner wants it; different palette |

Rules per stage: one stage at a time, staging soak of at least one working day, owner sign-off, release notes in `CHANGELOG.md`.

## Out of scope

- Doing any redesign beyond the single pilot page.
- Rebranding (new logo, new colours). The agent follows the current brand; a rebrand is a design decision first.
- Changing operator/admin looks.
- Visual regression tooling (Percy, Chromatic) and Storybook: listed as options in stage 0, not set up now.

## Open questions

1. Is the pilot page the search page? Any reason to prefer another?
2. Does the redesign have a design source (Figma file, reference sites, brief) or does the agent propose directions? If a Figma file exists, please share the link.
3. Customer surface only, or operator/admin too?
4. Who is the human reviewer for UI PRs, and who gives final staging sign-off?
5. When does the team consider Phase 1 finished, and who declares it?
6. Is the legacy `gilifast.*` colour set safe to remove (any marketing material referencing it)?
7. Model/cost budget for the agent: Sonnet default with the top model only for the first direction and protected-flow pages, OK?
8. Allow a Figma/Canva connector for mockups, or HTML previews only?

## Done when

- [ ] `.claude/agents/ui-designer.md` written with role, limits, allow-list, tools, model, and hand-off format.
- [ ] `docs/DESIGN_SYSTEM.md` written from the real tokens and primitives; Figma link added; the agent file points to it.
- [ ] Workflow documented (this doc, plus a short section in `docs/RELEASING.md` or `README.md` for the human review gate).
- [ ] Pilot page redesigned by the agent, running on staging, with before/after screenshots and checks recorded below.
- [ ] Pilot result and lessons recorded; the plan above adjusted.
- [ ] Docs swept (rule 7): `STRUCTURE.md` (agents row / design system doc), `CLAUDE.md` (pointer to the design system and the UI agent limits), `README.md`, `.claude/agents/ui-polisher.md` (how it differs from `ui-designer`), `CHANGELOG.md` `[Unreleased]`.
- [ ] `pnpm lint`, `pnpm typecheck`, unit and the e2e specs listed in step 5 pass.
- [ ] QC recorded here: what ran, the result, what could not be verified.

## Pilot result

_(empty until implemented)_
